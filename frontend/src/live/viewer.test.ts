import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SignalingChannel, SignalingHandlers, SignalMessage } from './signaling-protocol'
import {
  VIEW_ALREADY_JOINED_MESSAGE,
  VIEW_FAILURE_MESSAGE,
  VIEW_NOT_BROADCASTING_MESSAGE,
  VIEW_NOT_FOUND_MESSAGE,
} from './signaling-protocol'
import { createFakePeer, type FakePeer } from '../test/fakePeer'
import { RETRY_INTERVAL_MS, RETRY_LIMIT_MS, createLiveViewer, type ViewerDeps } from './viewer'

function setup(overrides: Partial<ViewerDeps> = {}) {
  const sent: SignalMessage[] = []
  const close = vi.fn()
  const peers: FakePeer[] = []
  let handlers: SignalingHandlers | null = null
  const deps: ViewerDeps = {
    openSignaling: vi.fn(async (_id: number, h: SignalingHandlers): Promise<SignalingChannel> => {
      handlers = h
      return { send: (message) => void sent.push(message), close }
    }),
    createPeerConnection: () => {
      const peer = createFakePeer()
      peers.push(peer)
      return peer
    },
    ...overrides,
  }
  return {
    deps,
    sent,
    close,
    peers,
    server: {
      send: (message: SignalMessage) => handlers?.onMessage(message),
      closeConnection: () => handlers?.onClose(),
    },
  }
}

async function joined() {
  const env = setup()
  const viewer = createLiveViewer(env.deps, 7)
  viewer.join()
  await vi.waitFor(() => expect(env.sent).toHaveLength(1))
  env.server.send({ type: 'joined', viewerId: '1' })
  return { viewer, env }
}

const stream = { id: 'remote' } as unknown as MediaStream

describe('시청 연결', () => {
  it('join하면 connecting이고, 연결되면 join-viewer를 보낸다', async () => {
    const { viewer, env } = await joined()

    expect(viewer.state()).toEqual({ phase: 'connecting' })
    expect(env.sent).toEqual([{ type: 'join-viewer' }])
    expect(env.deps.openSignaling).toHaveBeenCalledWith(7, expect.any(Object))
  })

  it('offer를 받으면 answer를 보내고, 영상이 오면 playing이 된다', async () => {
    const { viewer, env } = await joined()

    env.server.send({ type: 'offer', sdp: 'remote-offer' })
    await vi.waitFor(() => expect(env.sent).toHaveLength(2))

    expect(env.peers[0].remoteDescription).toEqual({ type: 'offer', sdp: 'remote-offer' })
    expect(env.sent[1]).toEqual({ type: 'answer', sdp: 'fake-answer' })
    expect(viewer.state().phase).toBe('connecting')

    env.peers[0].emitTrack(stream)
    expect(viewer.state()).toEqual({ phase: 'playing', stream })
  })

  it('받은 ICE 후보는 연결에 넣고, 내 후보는 서버로 보낸다', async () => {
    const { env } = await joined()
    env.server.send({ type: 'offer', sdp: 'o' })
    env.server.send({ type: 'candidate', candidate: { candidate: 'remote-cand' } })
    await vi.waitFor(() => expect(env.peers[0]?.candidates).toHaveLength(1))

    env.peers[0].emitCandidate({ candidate: 'my-cand' })

    expect(env.peers[0].candidates).toEqual([{ candidate: 'remote-cand' }])
    expect(env.sent.at(-1)).toEqual({ type: 'candidate', candidate: { candidate: 'my-cand' } })
  })

  it('서버가 ended를 보내면 ended가 되고 연결을 정리한다', async () => {
    const { viewer, env } = await joined()
    env.server.send({ type: 'offer', sdp: 'o' })
    await vi.waitFor(() => expect(env.peers).toHaveLength(1))
    env.peers[0].emitTrack(stream)

    env.server.send({ type: 'ended' })
    env.server.closeConnection()

    expect(viewer.state()).toEqual({ phase: 'ended' })
    expect(env.peers[0].closed).toBe(true)
    expect(env.close).toHaveBeenCalled()
  })

  it('이미 끝난 방송이라 거절되면 ended, 없는 방송이면 failed다', async () => {
    const ended = await joined()
    ended.env.server.send({ type: 'rejected', reason: 'ended' })
    expect(ended.viewer.state()).toEqual({ phase: 'ended' })

    const missing = await joined()
    missing.env.server.send({ type: 'rejected', reason: 'not-found' })
    expect(missing.viewer.state()).toEqual({ phase: 'failed', message: VIEW_NOT_FOUND_MESSAGE })
  })

  it('정원이 차서 거절되면 full이 되고 연결을 정리한다', async () => {
    const { env, viewer } = await joined()

    env.server.send({ type: 'rejected', reason: 'full' })

    expect(viewer.state()).toEqual({ phase: 'full' })
    expect(env.close).toHaveBeenCalled()
  })

  it('시그널링에 연결하지 못하면 failed다', async () => {
    const env = setup({
      openSignaling: vi.fn(async () => {
        throw new Error('연결 실패')
      }),
    })
    const viewer = createLiveViewer(env.deps, 7)

    viewer.join()

    await vi.waitFor(() => expect(viewer.state()).toEqual({ phase: 'failed', message: VIEW_FAILURE_MESSAGE }))
  })

  it('영상이 오기 전에 연결이 끊기면 failed다', async () => {
    const { viewer, env } = await joined()

    env.server.closeConnection()

    expect(viewer.state()).toEqual({ phase: 'failed', message: VIEW_FAILURE_MESSAGE })
  })

  it('PeerConnection이 실패하면 failed가 되고 연결을 정리한다', async () => {
    const { viewer, env } = await joined()
    env.server.send({ type: 'offer', sdp: 'o' })
    await vi.waitFor(() => expect(env.peers).toHaveLength(1))

    env.peers[0].emitFailed()

    expect(viewer.state()).toEqual({ phase: 'failed', message: VIEW_FAILURE_MESSAGE })
    expect(env.peers[0].closed).toBe(true)
  })

  it('협상 중 오류가 나면 failed다', async () => {
    const env = setup()
    env.deps.createPeerConnection = () => {
      const peer = createFakePeer()
      peer.setRemoteDescription = async () => {
        throw new Error('잘못된 offer')
      }
      env.peers.push(peer)
      return peer
    }
    const viewer = createLiveViewer(env.deps, 7)
    viewer.join()
    await vi.waitFor(() => expect(env.sent).toHaveLength(1))

    env.server.send({ type: 'offer', sdp: 'bad' })

    await vi.waitFor(() => expect(viewer.state()).toEqual({ phase: 'failed', message: VIEW_FAILURE_MESSAGE }))
  })

  it('화면을 떠나면 시그널링과 PeerConnection을 닫고 이후 메시지는 무시한다', async () => {
    const { viewer, env } = await joined()
    env.server.send({ type: 'offer', sdp: 'o' })
    await vi.waitFor(() => expect(env.peers).toHaveLength(1))

    viewer.dispose()
    env.server.send({ type: 'ended' })

    expect(env.close).toHaveBeenCalled()
    expect(env.peers[0].closed).toBe(true)
    expect(viewer.state()).toEqual({ phase: 'connecting' })
  })

  it('연결을 기다리는 도중 떠나면 늦게 열린 시그널링도 닫는다', async () => {
    let finishOpen: (channel: SignalingChannel) => void = () => {}
    const close = vi.fn()
    const send = vi.fn()
    const env = setup({
      openSignaling: () =>
        new Promise<SignalingChannel>((resolve) => {
          finishOpen = resolve
        }),
    })
    const viewer = createLiveViewer(env.deps, 7)
    viewer.join()

    viewer.dispose()
    finishOpen({ send, close })
    await vi.waitFor(() => expect(close).toHaveBeenCalled())

    expect(send).not.toHaveBeenCalled()
  })

  it('상태가 바뀔 때마다 구독자에게 알리고, 구독을 풀면 알리지 않는다', async () => {
    const { viewer, env } = await joined()
    const listener = vi.fn()
    const unsubscribe = viewer.subscribe(listener)

    env.server.send({ type: 'ended' })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    viewer.join()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('송출이 연결되기 전에 들어온 시청자', () => {
  afterEach(() => vi.useRealTimers())

  /** 가짜 타이머 아래에서 join하고 join-viewer를 보낸 상태까지 만든다. */
  async function joinedWithFakeTimers() {
    vi.useFakeTimers()
    const env = setup()
    const viewer = createLiveViewer(env.deps, 7)
    viewer.join()
    await vi.advanceTimersByTimeAsync(0)
    return { env, viewer }
  }

  it('not-broadcasting이면 연결 중으로 두고 3초 뒤 다시 접속한다', async () => {
    const { env, viewer } = await joinedWithFakeTimers()

    env.server.send({ type: 'rejected', reason: 'not-broadcasting' })

    expect(viewer.state()).toEqual({ phase: 'connecting' })
    expect(env.close).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS - 1)
    expect(env.deps.openSignaling).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(env.deps.openSignaling).toHaveBeenCalledTimes(2)
    expect(env.sent).toEqual([{ type: 'join-viewer' }, { type: 'join-viewer' }])
  })

  it('다시 접속했을 때 송출이 연결되어 있으면 정상으로 이어진다', async () => {
    const { env, viewer } = await joinedWithFakeTimers()
    env.server.send({ type: 'rejected', reason: 'not-broadcasting' })
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS)

    env.server.send({ type: 'joined', viewerId: '1' })
    env.server.send({ type: 'offer', sdp: 'o' })
    await vi.advanceTimersByTimeAsync(0)
    env.peers[0].emitTrack(stream)

    expect(viewer.state()).toEqual({ phase: 'playing', stream })
  })

  it('30초 동안 계속 거절되면 연결 중으로 기다리다가 실패 문구를 보인다', async () => {
    const { env, viewer } = await joinedWithFakeTimers()
    const attempts = RETRY_LIMIT_MS / RETRY_INTERVAL_MS

    for (let i = 0; i < attempts; i++) {
      env.server.send({ type: 'rejected', reason: 'not-broadcasting' })
      expect(viewer.state()).toEqual({ phase: 'connecting' })
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS)
    }
    env.server.send({ type: 'rejected', reason: 'not-broadcasting' })

    expect(viewer.state()).toEqual({ phase: 'failed', message: VIEW_NOT_BROADCASTING_MESSAGE })
    expect(env.deps.openSignaling).toHaveBeenCalledTimes(attempts + 1)
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 3)
    expect(env.deps.openSignaling).toHaveBeenCalledTimes(attempts + 1)
  })

  it('기다리는 동안 화면을 떠나면 다시 접속하지 않는다', async () => {
    const { env, viewer } = await joinedWithFakeTimers()
    env.server.send({ type: 'rejected', reason: 'not-broadcasting' })

    viewer.dispose()
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2)

    expect(env.deps.openSignaling).toHaveBeenCalledTimes(1)
  })

  it('주입한 타이머가 있으면 그것으로 다시 접속을 예약한다', async () => {
    const scheduled: { callback: () => void; delayMs: number }[] = []
    const cancel = vi.fn()
    const env = setup({
      schedule: (callback, delayMs) => {
        scheduled.push({ callback, delayMs })
        return cancel
      },
    })
    const viewer = createLiveViewer(env.deps, 7)
    viewer.join()
    await vi.waitFor(() => expect(env.sent).toHaveLength(1))

    env.server.send({ type: 'rejected', reason: 'not-broadcasting' })
    expect(scheduled.map((entry) => entry.delayMs)).toEqual([RETRY_INTERVAL_MS])
    scheduled[0].callback()

    await vi.waitFor(() => expect(env.sent).toHaveLength(2))
    viewer.dispose()
  })
})

describe('거절 사유별 문구', () => {
  it.each([
    ['not-found', 'failed', VIEW_NOT_FOUND_MESSAGE],
    ['already-joined', 'failed', VIEW_ALREADY_JOINED_MESSAGE],
    ['invalid-key', 'failed', VIEW_FAILURE_MESSAGE],
    ['사유 없음', 'failed', VIEW_FAILURE_MESSAGE],
  ])('%s는 %s 상태로 해당 문구를 보인다', async (reason, phase, message) => {
    const { viewer, env } = await joined()

    env.server.send({ type: 'rejected', reason: reason === '사유 없음' ? undefined : reason })

    expect(viewer.state()).toEqual({ phase, message })
  })
})
