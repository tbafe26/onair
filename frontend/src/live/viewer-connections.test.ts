import { describe, expect, it, vi } from 'vitest'
import { createFakePeer, type FakePeer } from '../test/fakePeer'
import type { SignalMessage } from './signaling-protocol'
import { createViewerConnections } from './viewer-connections'

function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  return { getTracks: () => tracks } as unknown as MediaStream
}

function setup() {
  const sent: SignalMessage[] = []
  const peers: FakePeer[] = []
  const viewers = createViewerConnections({
    createPeerConnection: () => {
      const peer = createFakePeer()
      peers.push(peer)
      return peer
    },
    send: (message) => void sent.push(message),
  })
  return { viewers, sent, peers }
}

const offers = (sent: SignalMessage[]) => sent.filter((message) => message.type === 'offer')

describe('시청자 연결', () => {
  it('시청자를 추가하면 영상을 싣고 offer를 그 시청자에게 보낸다', async () => {
    const { viewers, sent, peers } = setup()

    viewers.add('1', fakeStream())
    await vi.waitFor(() => expect(offers(sent)).toHaveLength(1))

    expect(viewers.has('1')).toBe(true)
    expect(peers[0].tracks).toHaveLength(2)
    expect(peers[0].localDescription).toEqual({ type: 'offer', sdp: 'fake-offer' })
    expect(sent.at(-1)).toEqual({ type: 'offer', to: '1', sdp: 'fake-offer' })
  })

  it('시청자마다 별도 연결을 만들고, 후보는 해당 시청자에게 보낸다', async () => {
    const { viewers, sent, peers } = setup()
    viewers.add('1', fakeStream())
    viewers.add('2', fakeStream())
    await vi.waitFor(() => expect(offers(sent)).toHaveLength(2))

    peers[1].emitCandidate({ candidate: 'to-two' })

    expect(peers).toHaveLength(2)
    expect(sent.at(-1)).toEqual({ type: 'candidate', to: '2', candidate: { candidate: 'to-two' } })
  })

  it('answer와 candidate는 지정한 시청자의 연결에만 넣는다', async () => {
    const { viewers, sent, peers } = setup()
    viewers.add('1', fakeStream())
    viewers.add('2', fakeStream())
    await vi.waitFor(() => expect(offers(sent)).toHaveLength(2))

    viewers.receiveAnswer('2', 'viewer-answer')
    viewers.receiveCandidate('2', { candidate: 'viewer-cand' })
    await vi.waitFor(() => expect(peers[1].candidates).toHaveLength(1))

    expect(peers[1].remoteDescription).toEqual({ type: 'answer', sdp: 'viewer-answer' })
    expect(peers[0].remoteDescription).toBeNull()
    expect(peers[0].candidates).toEqual([])
  })

  it('협상 단계는 시청자별로 도착한 순서대로 하나씩 처리한다', async () => {
    const { viewers, peers } = setup()
    const order: string[] = []
    viewers.add('1', fakeStream())
    let finishAnswer: () => void = () => {}
    peers[0].setRemoteDescription = (description) =>
      new Promise<void>((resolve) => {
        finishAnswer = () => {
          order.push(`answer:${description.sdp}`)
          resolve()
        }
      })
    peers[0].addIceCandidate = async (candidate) => void order.push(`candidate:${candidate.candidate}`)

    viewers.receiveAnswer('1', 'a')
    viewers.receiveCandidate('1', { candidate: 'c' })
    await vi.waitFor(() => expect(peers[0].localDescription).not.toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(order).toEqual([])

    finishAnswer()
    await vi.waitFor(() => expect(order).toEqual(['answer:a', 'candidate:c']))
  })

  it('한 시청자와의 협상이 실패하면 그 연결만 닫고 정리한다', async () => {
    const { viewers, sent, peers } = setup()
    viewers.add('1', fakeStream())
    viewers.add('2', fakeStream())
    await vi.waitFor(() => expect(offers(sent)).toHaveLength(2))
    peers[0].setRemoteDescription = async () => {
      throw new Error('잘못된 answer')
    }

    viewers.receiveAnswer('1', 'bad')
    await vi.waitFor(() => expect(peers[0].closed).toBe(true))

    expect(peers[1].closed).toBe(false)
    expect(viewers.has('1')).toBe(false)
    expect(viewers.has('2')).toBe(true)
  })

  it('연결이 복구되지 않게 실패하면 그 시청자만 닫는다', async () => {
    const { viewers, peers } = setup()
    viewers.add('1', fakeStream())
    viewers.add('2', fakeStream())

    peers[0].emitFailed()

    expect(peers[0].closed).toBe(true)
    expect(peers[1].closed).toBe(false)
    expect(viewers.has('1')).toBe(false)
  })

  it('제거한 시청자의 연결은 닫고 다른 시청자는 유지한다', async () => {
    const { viewers, sent, peers } = setup()
    viewers.add('1', fakeStream())
    viewers.add('2', fakeStream())
    await vi.waitFor(() => expect(offers(sent)).toHaveLength(2))

    viewers.remove('1')

    expect(peers[0].closed).toBe(true)
    expect(peers[1].closed).toBe(false)
    viewers.receiveAnswer('2', 'still-ok')
    await vi.waitFor(() => expect(peers[1].remoteDescription).not.toBeNull())
  })

  it('제거된 시청자의 후보는 보내지 않는다', async () => {
    const { viewers, sent, peers } = setup()
    viewers.add('1', fakeStream())
    await vi.waitFor(() => expect(offers(sent)).toHaveLength(1))
    viewers.remove('1')
    const before = sent.length

    peers[0].emitCandidate({ candidate: 'late' })

    expect(sent).toHaveLength(before)
  })

  it('전체를 정리하면 모든 연결을 닫는다', async () => {
    const { viewers, sent, peers } = setup()
    viewers.add('1', fakeStream())
    viewers.add('2', fakeStream())
    await vi.waitFor(() => expect(offers(sent)).toHaveLength(2))

    viewers.closeAll()

    expect(peers.every((peer) => peer.closed)).toBe(true)
    expect(viewers.has('1')).toBe(false)
    expect(viewers.has('2')).toBe(false)
  })

  it('알 수 없는 시청자를 가리키는 answer, candidate, 제거는 무시한다', async () => {
    const { viewers, peers } = setup()

    viewers.receiveAnswer('9', 'x')
    viewers.receiveCandidate('9', { candidate: 'x' })
    viewers.remove('9')

    expect(peers).toHaveLength(0)
  })
})
