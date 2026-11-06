import { describe, expect, it, vi } from 'vitest'
import {
  createLiveBroadcaster,
  type BroadcasterDeps,
  type SignalingChannel,
  type SignalingHandlers,
  type SignalMessage,
} from './broadcaster'

function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  const stream = { getTracks: () => tracks } as unknown as MediaStream
  return { stream, tracks }
}

function domError(name: string) {
  const error = new Error(name)
  error.name = name
  return error
}

/** 가짜 의존성. 서버 쪽 동작은 testing 객체로 직접 일으킨다. */
function setup(overrides: Partial<BroadcasterDeps> = {}) {
  const camera = fakeStream()
  const sent: SignalMessage[] = []
  const close = vi.fn()
  let handlers: SignalingHandlers | null = null
  const startLive = vi.fn(async () => ({ id: 7, streamKey: 'fake-stream-key' }))
  const release = vi.fn(async () => undefined)
  const deps: BroadcasterDeps = {
    getUserMedia: vi.fn(async () => camera.stream),
    startLive,
    openSignaling: vi.fn(async (_id: number, h: SignalingHandlers): Promise<SignalingChannel> => {
      handlers = h
      return { send: (message) => void sent.push(message), close }
    }),
    now: () => 1_000,
    requestWakeLock: vi.fn(async () => ({ release })),
    ...overrides,
  }
  return {
    deps,
    camera,
    sent,
    close,
    startLive,
    release,
    server: {
      send: (message: SignalMessage) => handlers?.onMessage(message),
      closeConnection: () => handlers?.onClose(),
    },
  }
}

async function previewing(env = setup()) {
  const broadcaster = createLiveBroadcaster(env.deps)
  broadcaster.open()
  await vi.waitFor(() => expect(broadcaster.state().phase).toBe('previewing'))
  return { broadcaster, env }
}

async function onAir() {
  const { broadcaster, env } = await previewing()
  const started = broadcaster.start({ title: '제목', thumbnail: null })
  await vi.waitFor(() => expect(env.sent).toHaveLength(1))
  env.server.send({ type: 'joined' })
  await started
  return { broadcaster, env }
}

describe('카메라 열기', () => {
  it('열면 requestingCamera를 거쳐 전면 카메라 1280x720 희망값으로 미리보기가 된다', async () => {
    const env = setup()
    const broadcaster = createLiveBroadcaster(env.deps)

    broadcaster.open()
    expect(broadcaster.state().phase).toBe('requestingCamera')
    await vi.waitFor(() => expect(broadcaster.state().phase).toBe('previewing'))

    expect(broadcaster.state()).toMatchObject({ phase: 'previewing', startFailure: null })
    expect(env.deps.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    })
  })

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'notFound'],
    ['NotReadableError', 'notFound'],
  ])('%s 오류는 cameraUnavailable(%s)이 된다', async (name, reason) => {
    const env = setup({
      getUserMedia: vi.fn(async () => {
        throw domError(name)
      }),
    })
    const broadcaster = createLiveBroadcaster(env.deps)

    broadcaster.open()

    await vi.waitFor(() =>
      expect(broadcaster.state()).toEqual({ phase: 'cameraUnavailable', reason }),
    )
  })

  it('보안 컨텍스트가 아니라 getUserMedia가 없으면 insecure다', async () => {
    const broadcaster = createLiveBroadcaster(setup({ getUserMedia: null }).deps)

    broadcaster.open()

    await vi.waitFor(() =>
      expect(broadcaster.state()).toEqual({ phase: 'cameraUnavailable', reason: 'insecure' }),
    )
  })

  it('상태가 바뀔 때마다 구독자에게 알리고, 구독을 풀면 알리지 않는다', async () => {
    const broadcaster = createLiveBroadcaster(setup().deps)
    const listener = vi.fn()
    const unsubscribe = broadcaster.subscribe(listener)

    broadcaster.open()
    await vi.waitFor(() => expect(broadcaster.state().phase).toBe('previewing'))
    expect(listener).toHaveBeenCalled()

    unsubscribe()
    listener.mockClear()
    broadcaster.dispose()
    broadcaster.open()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('송출 시작', () => {
  it('시작하면 starting을 거쳐 서버의 joined를 받으면 onAir가 되고, 키는 첫 메시지로 보낸다', async () => {
    const { broadcaster, env } = await previewing()

    const started = broadcaster.start({ title: '제목', thumbnail: null })
    expect(broadcaster.state().phase).toBe('starting')
    await vi.waitFor(() => expect(env.sent).toHaveLength(1))
    expect(env.sent[0]).toEqual({ type: 'join-broadcaster', streamKey: 'fake-stream-key' })
    expect(broadcaster.state().phase).toBe('starting')

    env.server.send({ type: 'joined' })
    await started

    expect(broadcaster.state()).toMatchObject({ phase: 'onAir', broadcastId: 7, startedAt: 1_000 })
    expect(env.deps.openSignaling).toHaveBeenCalledWith(7, expect.any(Object))
  })

  it('시작하는 동안 다시 시작해도 방송은 한 번만 만든다', async () => {
    const { broadcaster, env } = await previewing()

    const first = broadcaster.start({ title: '제목', thumbnail: null })
    await broadcaster.start({ title: '제목', thumbnail: null })
    await vi.waitFor(() => expect(env.sent).toHaveLength(1))
    env.server.send({ type: 'joined' })
    await first

    expect(env.startLive).toHaveBeenCalledTimes(1)
  })

  it('방송을 만들지 못하면 미리보기로 돌아가 이유를 보여 주고 다시 시작할 수 있다', async () => {
    const env = setup()
    env.startLive.mockRejectedValueOnce(new Error('제목을 입력하세요'))
    const { broadcaster } = await previewing(env)

    await broadcaster.start({ title: '', thumbnail: null })

    expect(broadcaster.state()).toMatchObject({
      phase: 'previewing',
      startFailure: '제목을 입력하세요',
    })
    const retry = broadcaster.start({ title: '제목', thumbnail: null })
    await vi.waitFor(() => expect(env.sent).toHaveLength(1))
    env.server.send({ type: 'joined' })
    await retry
    expect(broadcaster.state().phase).toBe('onAir')
  })

  it('서버가 송출자를 거절하면 미리보기로 돌아가 이유를 보여 주고 카메라는 유지한다', async () => {
    const { broadcaster, env } = await previewing()

    const started = broadcaster.start({ title: '제목', thumbnail: null })
    await vi.waitFor(() => expect(env.sent).toHaveLength(1))
    env.server.send({ type: 'rejected', reason: 'invalid-key' })
    await started

    expect(broadcaster.state()).toMatchObject({ phase: 'previewing' })
    expect(broadcaster.state()).toHaveProperty('startFailure', expect.stringContaining('송출을 시작하지 못했습니다'))
    expect(env.close).toHaveBeenCalled()
    env.camera.tracks.forEach((track) => expect(track.stop).not.toHaveBeenCalled())
  })

  it('시그널링에 연결하지 못해도 미리보기로 돌아간다', async () => {
    const env = setup({
      openSignaling: vi.fn(async () => {
        throw new Error('연결 실패')
      }),
    })
    const { broadcaster } = await previewing(env)

    await broadcaster.start({ title: '제목', thumbnail: null })

    expect(broadcaster.state()).toMatchObject({ phase: 'previewing', startFailure: '연결 실패' })
  })

  it('송출을 시작하면 화면 꺼짐 방지 잠금을 요청한다', async () => {
    const { env } = await onAir()

    expect(env.deps.requestWakeLock).toHaveBeenCalled()
  })
})

describe('송출 종료', () => {
  it('end를 보내고 서버가 ended로 확인하면 카메라와 마이크를 끄고 ended가 된다', async () => {
    const { broadcaster, env } = await onAir()
    await vi.waitFor(() => expect(env.deps.requestWakeLock).toHaveBeenCalled())

    const ending = broadcaster.end()
    expect(env.sent.at(-1)).toEqual({ type: 'end' })
    expect(broadcaster.state().phase).toBe('onAir')
    env.server.send({ type: 'ended' })
    await ending

    expect(broadcaster.state()).toEqual({ phase: 'ended', broadcastId: 7 })
    env.camera.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
    expect(env.close).toHaveBeenCalled()
    await vi.waitFor(() => expect(env.release).toHaveBeenCalled())
  })

  it('송출 중 서버가 연결을 닫으면 카메라를 끄고 ended가 된다', async () => {
    const { broadcaster, env } = await onAir()

    env.server.closeConnection()

    expect(broadcaster.state()).toEqual({ phase: 'ended', broadcastId: 7 })
    env.camera.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
  })

  it('화면을 떠나면 end 없이 카메라를 끄고 연결을 닫는다(서버가 연결 끊김으로 종료한다)', async () => {
    const { broadcaster, env } = await onAir()

    broadcaster.dispose()

    expect(env.sent.some((message) => message.type === 'end')).toBe(false)
    env.camera.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
    expect(env.close).toHaveBeenCalled()
  })

  it('송출 중이 아닐 때 end는 아무 일도 하지 않는다', async () => {
    const { broadcaster, env } = await previewing()

    await broadcaster.end()

    expect(broadcaster.state().phase).toBe('previewing')
    expect(env.sent).toEqual([])
  })
})

describe('화면 정리', () => {
  it('카메라 권한을 기다리는 도중 떠나면 늦게 받은 카메라도 끈다', async () => {
    const camera = fakeStream()
    let grant: (stream: MediaStream) => void = () => {}
    const env = setup({
      getUserMedia: vi.fn(
        () =>
          new Promise<MediaStream>((resolve) => {
            grant = resolve
          }),
      ),
    })
    const broadcaster = createLiveBroadcaster(env.deps)

    broadcaster.open()
    broadcaster.dispose()
    grant(camera.stream)
    await Promise.resolve()

    camera.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
    expect(broadcaster.state().phase).toBe('requestingCamera')
  })
})
