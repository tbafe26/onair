import { describe, expect, it, vi } from 'vitest'
import type { SignalingChannel, SignalingHandlers, SignalMessage } from './broadcaster'
import { createFakePeer, type FakePeer } from '../test/fakePeer'
import { createLiveViewer, type ViewerDeps } from './viewer'

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

  it('이미 끝난 방송이라 거절되면 ended, 그 밖의 거절은 failed다', async () => {
    const ended = await joined()
    ended.env.server.send({ type: 'rejected', reason: 'ended' })
    expect(ended.viewer.state()).toEqual({ phase: 'ended' })

    const missing = await joined()
    missing.env.server.send({ type: 'rejected', reason: 'not-found' })
    expect(missing.viewer.state()).toEqual({ phase: 'failed' })
  })

  it('시그널링에 연결하지 못하면 failed다', async () => {
    const env = setup({
      openSignaling: vi.fn(async () => {
        throw new Error('연결 실패')
      }),
    })
    const viewer = createLiveViewer(env.deps, 7)

    viewer.join()

    await vi.waitFor(() => expect(viewer.state()).toEqual({ phase: 'failed' }))
  })

  it('영상이 오기 전에 연결이 끊기면 failed다', async () => {
    const { viewer, env } = await joined()

    env.server.closeConnection()

    expect(viewer.state()).toEqual({ phase: 'failed' })
  })

  it('PeerConnection이 실패하면 failed가 되고 연결을 정리한다', async () => {
    const { viewer, env } = await joined()
    env.server.send({ type: 'offer', sdp: 'o' })
    await vi.waitFor(() => expect(env.peers).toHaveLength(1))

    env.peers[0].emitFailed()

    expect(viewer.state()).toEqual({ phase: 'failed' })
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

    await vi.waitFor(() => expect(viewer.state()).toEqual({ phase: 'failed' }))
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
