// 시청 모듈. React와 무관하고, 시그널링 연결과 PeerConnection 생성은 바깥에서 받는다(deps).
import type { SignalingChannel, SignalingHandlers, SignalMessage } from './broadcaster'
import type { PeerConnectionLike } from './peer'

export type ViewerState =
  | { phase: 'connecting' }
  | { phase: 'playing'; stream: MediaStream }
  | { phase: 'ended' }
  | { phase: 'failed' }

export interface ViewerDeps {
  openSignaling(broadcastId: number, handlers: SignalingHandlers): Promise<SignalingChannel>
  createPeerConnection(): PeerConnectionLike
}

export interface LiveViewer {
  state(): ViewerState
  subscribe(listener: () => void): () => void
  /** 시청을 시작한다. dispose 뒤에 다시 부르면 처음부터 다시 연결한다. */
  join(): void
  /** 화면을 떠난다. 연결을 모두 정리한다. */
  dispose(): void
}

export function createLiveViewer(deps: ViewerDeps, broadcastId: number): LiveViewer {
  let current: ViewerState = { phase: 'connecting' }
  const listeners = new Set<() => void>()
  // join과 dispose마다 올린다. 늦게 도착한 콜백이 이미 정리된 연결을 건드리지 않게 거른다.
  let generation = 0
  let channel: SignalingChannel | null = null
  let peer: PeerConnectionLike | null = null
  // 같은 연결에 대한 협상 단계(offer, candidate)를 도착한 순서대로 하나씩 처리한다.
  let queue: Promise<void> = Promise.resolve()

  function set(next: ViewerState) {
    current = next
    listeners.forEach((listener) => listener())
  }

  function teardown() {
    const openChannel = channel
    const connection = peer
    channel = null
    peer = null
    queue = Promise.resolve()
    openChannel?.close()
    connection?.close()
  }

  /** 끝났거나 실패했다. 연결을 정리하고 해당 상태로 바꾼다. 이미 끝난 뒤에는 바꾸지 않는다. */
  function settle(next: { phase: 'ended' } | { phase: 'failed' }) {
    if (current.phase === 'ended' || current.phase === 'failed') return
    teardown()
    set(next)
  }

  function enqueue(session: number, task: () => Promise<void>) {
    queue = queue.then(async () => {
      if (session !== generation) return
      try {
        await task()
      } catch {
        if (session === generation) settle({ phase: 'failed' })
      }
    })
  }

  function connection(session: number): PeerConnectionLike {
    if (peer) return peer
    const created = deps.createPeerConnection()
    peer = created
    created.onIceCandidate((candidate) => {
      if (session === generation) channel?.send({ type: 'candidate', candidate })
    })
    created.onTrack((stream) => {
      if (session === generation && current.phase === 'connecting') set({ phase: 'playing', stream })
    })
    created.onFailed(() => {
      if (session === generation) settle({ phase: 'failed' })
    })
    return created
  }

  function handle(session: number, message: SignalMessage) {
    if (session !== generation) return
    switch (message.type) {
      case 'offer': {
        const sdp = message.sdp
        if (typeof sdp !== 'string') return
        enqueue(session, async () => {
          const pc = connection(session)
          await pc.setRemoteDescription({ type: 'offer', sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          channel?.send({ type: 'answer', sdp: answer.sdp })
        })
        break
      }
      case 'candidate': {
        const candidate = message.candidate
        if (typeof candidate !== 'object' || candidate === null) return
        enqueue(session, async () => {
          await connection(session).addIceCandidate(candidate as RTCIceCandidateInit)
        })
        break
      }
      case 'rejected':
        // 이미 끝난 방송이면 종료 안내를, 그 밖의 거절은 연결 실패로 보여 준다.
        settle(message.reason === 'ended' ? { phase: 'ended' } : { phase: 'failed' })
        break
      case 'ended':
        settle({ phase: 'ended' })
        break
    }
  }

  return {
    state: () => current,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    join() {
      generation += 1
      const session = generation
      teardown()
      set({ phase: 'connecting' })
      deps
        .openSignaling(broadcastId, {
          onMessage: (message) => handle(session, message),
          onClose() {
            if (session === generation) settle({ phase: 'failed' })
          },
        })
        .then((opened) => {
          if (session !== generation) {
            opened.close()
            return
          }
          channel = opened
          opened.send({ type: 'join-viewer' })
        })
        .catch(() => {
          if (session === generation) settle({ phase: 'failed' })
        })
    },

    dispose() {
      generation += 1
      teardown()
      current = { phase: 'connecting' }
    },
  }
}
