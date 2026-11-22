import { AxiosError, type AxiosResponse } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { createLiveBroadcaster, type BroadcasterDeps, PUBLISH_FAILURE_MESSAGE, type Publication } from './broadcaster'

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

/** 방송 만들기 요청에 서버가 돌려준 오류 응답. */
function serverRejection(status: number, data: unknown) {
  return new AxiosError('요청 실패', undefined, undefined, undefined, { status, data } as AxiosResponse)
}

interface FakePublication extends Publication {
  closed: boolean
  /** 영상 연결이 복구되지 않을 만큼 끊겼다고 알린다. */
  fail(): void
}

function createFakePublication(): FakePublication {
  let onFailed = () => {}
  const publication: FakePublication = {
    closed: false,
    onFailed: (listener) => void (onFailed = listener),
    close: () => void (publication.closed = true),
    fail: () => onFailed(),
  }
  return publication
}

/** 가짜 의존성. 미디어 서버 쪽 동작은 publications로 직접 일으킨다. */
function setup(overrides: Partial<BroadcasterDeps> = {}) {
  const camera = fakeStream()
  const startLive = vi.fn(async () => ({ id: 7, streamKey: 'fake-stream-key' }))
  const endLive = vi.fn<(broadcastId: number) => Promise<undefined>>(async () => undefined)
  const release = vi.fn(async () => undefined)
  const publications: FakePublication[] = []
  const deps: BroadcasterDeps = {
    getUserMedia: vi.fn(async () => camera.stream),
    startLive,
    endLive,
    publish: vi.fn(async () => {
      const publication = createFakePublication()
      publications.push(publication)
      return publication
    }),
    now: () => 1_000,
    requestWakeLock: vi.fn(async () => ({ release })),
    ...overrides,
  }
  return { deps, camera, startLive, endLive, release, publications }
}

async function previewing(env = setup()) {
  const broadcaster = createLiveBroadcaster(env.deps)
  broadcaster.open()
  await vi.waitFor(() => expect(broadcaster.state().phase).toBe('previewing'))
  return { broadcaster, env }
}

async function onAirWith(env: ReturnType<typeof setup>) {
  const { broadcaster } = await previewing(env)
  await broadcaster.start({ title: '제목', thumbnail: null })
  return { broadcaster, env }
}

const onAir = () => onAirWith(setup())

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
  it('시작하면 starting을 거쳐 방송 id와 송출 키로 카메라 영상을 보낸 뒤 onAir가 된다', async () => {
    const { broadcaster, env } = await previewing()

    const started = broadcaster.start({ title: '제목', thumbnail: null })
    expect(broadcaster.state().phase).toBe('starting')
    await started

    expect(env.deps.publish).toHaveBeenCalledWith(7, 'fake-stream-key', env.camera.stream)
    expect(broadcaster.state()).toMatchObject({ phase: 'onAir', broadcastId: 7, startedAt: 1_000 })
  })

  it('시작하는 동안 다시 시작해도 방송은 한 번만 만든다', async () => {
    const { broadcaster, env } = await previewing()

    const first = broadcaster.start({ title: '제목', thumbnail: null })
    await broadcaster.start({ title: '제목', thumbnail: null })
    await first

    expect(env.startLive).toHaveBeenCalledTimes(1)
    expect(env.deps.publish).toHaveBeenCalledTimes(1)
  })

  it('서버가 입력을 필드별로 거절하면 해독한 ApiFailure를 그대로 상태에 남긴다', async () => {
    const env = setup()
    env.startLive.mockRejectedValueOnce(
      serverRejection(400, { errors: [{ field: 'title', reason: '제목 오류' }] }),
    )
    const { broadcaster } = await previewing(env)

    await broadcaster.start({ title: '', thumbnail: null })

    expect(broadcaster.state()).toMatchObject({
      phase: 'previewing',
      startFailure: { kind: 'invalid', fieldErrors: { title: '제목 오류' } },
    })
  })

  it('썸네일이 너무 커서 413이면 상한 값과 문구를 담은 ApiFailure로 남긴다', async () => {
    const env = setup()
    env.startLive.mockRejectedValueOnce(
      serverRejection(413, { detail: '썸네일은 2MB 이하만 올릴 수 있습니다', maxBytes: 2_097_152 }),
    )
    const { broadcaster } = await previewing(env)

    await broadcaster.start({ title: '제목', thumbnail: null })

    expect(broadcaster.state()).toMatchObject({
      phase: 'previewing',
      startFailure: { kind: 'tooLarge', maxBytes: 2_097_152, message: '썸네일은 2MB 이하만 올릴 수 있습니다' },
    })
  })

  it('방송을 만들지 못하면 미리보기로 돌아가 이유를 남기고 다시 시작할 수 있다', async () => {
    const env = setup()
    env.startLive.mockRejectedValueOnce(new Error('network'))
    const { broadcaster } = await previewing(env)

    await broadcaster.start({ title: '제목', thumbnail: null })

    expect(broadcaster.state()).toMatchObject({ phase: 'previewing', startFailure: { kind: 'unknown' } })
    expect(env.deps.publish).not.toHaveBeenCalled()
    await broadcaster.start({ title: '제목', thumbnail: null })
    expect(broadcaster.state()).toMatchObject({ phase: 'onAir' })
  })

  it('영상을 보내지 못하면 만든 방송을 종료하고 미리보기로 돌아가 이유를 남긴다', async () => {
    const env = setup({
      publish: vi.fn(async () => {
        throw new Error('whip 401')
      }),
    })
    const { broadcaster } = await previewing(env)

    await broadcaster.start({ title: '제목', thumbnail: null })

    expect(env.endLive).toHaveBeenCalledWith(7)
    expect(broadcaster.state()).toMatchObject({
      phase: 'previewing',
      startFailure: { kind: 'message', message: PUBLISH_FAILURE_MESSAGE },
    })
    env.camera.tracks.forEach((track) => expect(track.stop).not.toHaveBeenCalled())
  })

  it('영상 송출과 종료 요청이 모두 실패해도 미리보기로 돌아간다', async () => {
    const env = setup({
      publish: vi.fn(async () => {
        throw new Error('whip 401')
      }),
    })
    env.endLive.mockRejectedValueOnce(new Error('network'))
    const { broadcaster } = await previewing(env)

    await broadcaster.start({ title: '제목', thumbnail: null })

    expect(broadcaster.state()).toMatchObject({ phase: 'previewing', startFailure: { kind: 'message' } })
  })

  it('송출을 시작하면 화면 꺼짐 방지 잠금을 요청한다', async () => {
    const { env } = await onAir()

    expect(env.deps.requestWakeLock).toHaveBeenCalled()
  })
})

describe('화면 꺼짐 방지', () => {
  it('지원하지 않는 브라우저에서도 송출은 정상이다', async () => {
    const { broadcaster } = await onAirWith(setup({ requestWakeLock: undefined, watchVisible: undefined }))

    expect(broadcaster.state().phase).toBe('onAir')
    broadcaster.dispose()
  })

  it('요청이 거절돼도 송출은 계속된다', async () => {
    const { broadcaster } = await onAirWith(
      setup({ requestWakeLock: vi.fn(async () => Promise.reject(new Error('denied'))) }),
    )

    expect(broadcaster.state().phase).toBe('onAir')
  })
})

describe('송출 종료', () => {
  it('종료하면 서버에 종료를 요청하고 카메라와 마이크, 영상 연결, 화면 잠금을 정리한 뒤 ended가 된다', async () => {
    const { broadcaster, env } = await onAir()
    await vi.waitFor(() => expect(env.deps.requestWakeLock).toHaveBeenCalled())

    await broadcaster.end()

    expect(env.endLive).toHaveBeenCalledWith(7)
    expect(broadcaster.state()).toEqual({ phase: 'ended', broadcastId: 7 })
    env.camera.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
    expect(env.publications[0].closed).toBe(true)
    await vi.waitFor(() => expect(env.release).toHaveBeenCalled())
  })

  it('종료 요청이 끝나기 전에 다시 눌러도 요청은 한 번이다', async () => {
    const { broadcaster, env } = await onAir()
    let confirm = () => {}
    env.endLive.mockReturnValueOnce(new Promise<undefined>((resolve) => (confirm = () => resolve(undefined))))

    const first = broadcaster.end()
    const second = broadcaster.end()
    expect(broadcaster.state().phase).toBe('onAir')
    confirm()
    await Promise.all([first, second])

    expect(env.endLive).toHaveBeenCalledTimes(1)
    expect(broadcaster.state().phase).toBe('ended')
  })

  it('종료 요청이 실패해도 화면은 ended가 된다(서버 방송은 송출이 끊긴 것을 보고 정리된다)', async () => {
    const { broadcaster, env } = await onAir()
    env.endLive.mockRejectedValueOnce(new Error('network'))

    await broadcaster.end()

    expect(broadcaster.state()).toEqual({ phase: 'ended', broadcastId: 7 })
    expect(env.publications[0].closed).toBe(true)
  })

  it('송출 중 영상 연결이 끊기면(다른 곳에서 종료됨 등) 종료를 요청하고 카메라를 끄고 ended가 된다', async () => {
    const { broadcaster, env } = await onAir()

    env.publications[0].fail()

    expect(env.endLive).toHaveBeenCalledWith(7)
    expect(broadcaster.state()).toEqual({ phase: 'ended', broadcastId: 7 })
    env.camera.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
  })

  it('송출 중에 화면을 떠나면 종료를 요청하고 카메라와 영상 연결을 닫는다', async () => {
    const { broadcaster, env } = await onAir()

    broadcaster.dispose()

    expect(env.endLive).toHaveBeenCalledWith(7)
    env.camera.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
    expect(env.publications[0].closed).toBe(true)
  })

  it('송출 중이 아닐 때 end와 화면 떠나기는 종료를 요청하지 않는다', async () => {
    const { broadcaster, env } = await previewing()

    await broadcaster.end()
    expect(broadcaster.state().phase).toBe('previewing')
    broadcaster.dispose()

    expect(env.endLive).not.toHaveBeenCalled()
  })

  it('종료한 뒤에 영상 연결이 끊겼다는 알림이 와도 종료를 다시 요청하지 않는다', async () => {
    const { broadcaster, env } = await onAir()

    await broadcaster.end()
    env.publications[0].fail()

    expect(env.endLive).toHaveBeenCalledTimes(1)
  })

  it('onAir가 되면 시청자 수는 0이다', async () => {
    const { broadcaster } = await onAir()

    expect(broadcaster.state()).toMatchObject({ phase: 'onAir', viewerCount: 0, maxViewers: null })
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

describe('카메라 전환', () => {
  const twoCameras = () => ({
    enumerateDevices: vi.fn(async () => [{ kind: 'videoinput' }, { kind: 'videoinput' }, { kind: 'audioinput' }]),
  })

  it('카메라가 둘 이상이면 전환할 수 있고, 처음에는 전면이다', async () => {
    const { broadcaster } = await previewing(setup(twoCameras()))

    await vi.waitFor(() => expect(broadcaster.cameraInfo().canSwitch).toBe(true))
    expect(broadcaster.cameraInfo().facing).toBe('user')
  })

  it('카메라가 하나이거나 장치 목록을 알 수 없으면 전환할 수 없다', async () => {
    const one = await previewing(setup({ enumerateDevices: vi.fn(async () => [{ kind: 'videoinput' }]) }))
    const unknown = await previewing(setup())
    const failing = await previewing(
      setup({
        enumerateDevices: async () => {
          throw new Error('목록 실패')
        },
      }),
    )

    await vi.waitFor(() => expect(one.env.deps.enumerateDevices).toHaveBeenCalled())
    for (const { broadcaster } of [one, unknown, failing]) {
      expect(broadcaster.cameraInfo().canSwitch).toBe(false)
    }
  })

  it('전환하면 이전 스트림을 끄고 후면 카메라로 새 스트림을 연다', async () => {
    const env = setup(twoCameras())
    const { broadcaster } = await previewing(env)
    await vi.waitFor(() => expect(broadcaster.cameraInfo().canSwitch).toBe(true))
    const next = fakeStream()
    vi.mocked(env.deps.getUserMedia!).mockResolvedValueOnce(next.stream)

    await broadcaster.switchCamera()

    expect(env.camera.tracks.every((track) => track.stop.mock.calls.length === 1)).toBe(true)
    expect(env.deps.getUserMedia).toHaveBeenLastCalledWith({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    })
    expect(broadcaster.state()).toMatchObject({ phase: 'previewing', stream: next.stream })
    expect(broadcaster.cameraInfo()).toMatchObject({ facing: 'environment', switching: false, switchFailure: null })

    await broadcaster.switchCamera()
    expect(broadcaster.cameraInfo().facing).toBe('user')
  })

  it('전환에 실패하면 이전 카메라를 다시 열고 이유를 남긴다', async () => {
    const env = setup(twoCameras())
    const { broadcaster } = await previewing(env)
    await vi.waitFor(() => expect(broadcaster.cameraInfo().canSwitch).toBe(true))
    const restored = fakeStream()
    vi.mocked(env.deps.getUserMedia!)
      .mockRejectedValueOnce(domError('OverconstrainedError'))
      .mockResolvedValueOnce(restored.stream)

    await broadcaster.switchCamera()

    expect(broadcaster.state()).toMatchObject({ phase: 'previewing', stream: restored.stream })
    expect(broadcaster.cameraInfo()).toMatchObject({ facing: 'user', switching: false })
    expect(broadcaster.cameraInfo().switchFailure).toContain('카메라를 바꾸지 못했습니다')
  })

  it('전환도 복구도 실패하면 카메라를 쓸 수 없는 상태가 된다', async () => {
    const env = setup(twoCameras())
    const { broadcaster } = await previewing(env)
    await vi.waitFor(() => expect(broadcaster.cameraInfo().canSwitch).toBe(true))
    vi.mocked(env.deps.getUserMedia!).mockRejectedValue(domError('NotReadableError'))

    await broadcaster.switchCamera()

    expect(broadcaster.state()).toEqual({ phase: 'cameraUnavailable', reason: 'notFound' })
  })

  it('송출 중에는 전환하지 않는다', async () => {
    const env = setup(twoCameras())
    const started = await onAirWith(env)
    await vi.waitFor(() => expect(started.broadcaster.cameraInfo().canSwitch).toBe(true))
    const calls = vi.mocked(env.deps.getUserMedia!).mock.calls.length

    await started.broadcaster.switchCamera()

    expect(vi.mocked(env.deps.getUserMedia!).mock.calls).toHaveLength(calls)
    expect(started.broadcaster.state().phase).toBe('onAir')
    expect(started.broadcaster.cameraInfo().facing).toBe('user')
  })

  it('전환하는 동안에는 송출을 시작하지 않는다', async () => {
    const env = setup(twoCameras())
    const { broadcaster } = await previewing(env)
    let finish: (stream: MediaStream) => void = () => {}
    vi.mocked(env.deps.getUserMedia!).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))

    const switching = broadcaster.switchCamera()
    expect(broadcaster.cameraInfo().switching).toBe(true)
    await broadcaster.start({ title: '제목', thumbnail: null })
    expect(env.startLive).not.toHaveBeenCalled()

    finish(fakeStream().stream)
    await switching
    expect(broadcaster.cameraInfo().switching).toBe(false)
  })
})
