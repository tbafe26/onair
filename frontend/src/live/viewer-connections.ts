// 송출 모듈 내부: 시청자 한 명당 하나씩 두는 PeerConnection과 그 협상 순서를 관리한다.
import type { PeerConnectionLike } from './peer'
import { candidateTo, offerTo, type SignalMessage } from './signaling-protocol'

export interface ViewerConnectionsDeps {
  createPeerConnection(): PeerConnectionLike
  /** 시그널링 채널로 보낸다. 채널이 없으면 조용히 버려도 된다. */
  send(message: SignalMessage): void
}

export interface ViewerConnections {
  has(viewerId: string): boolean
  /** 시청자 몫의 연결을 만들어 stream을 싣고 offer를 보낸다. */
  add(viewerId: string, stream: MediaStream): void
  /** 그 시청자의 연결만 닫는다. */
  remove(viewerId: string): void
  /** 시청자의 answer를 그 시청자의 협상 순서 뒤에 넣는다. */
  receiveAnswer(viewerId: string, sdp: string): void
  receiveCandidate(viewerId: string, candidate: RTCIceCandidateInit): void
  closeAll(): void
}

export function createViewerConnections(deps: ViewerConnectionsDeps): ViewerConnections {
  // queue는 한 시청자의 협상 단계를 도착한 순서대로 하나씩 처리하게 한다.
  const viewers = new Map<string, { connection: PeerConnectionLike; queue: Promise<void> }>()

  function remove(viewerId: string) {
    viewers.get(viewerId)?.connection.close()
    viewers.delete(viewerId)
  }

  /** 실패하면 그 시청자의 연결만 닫는다. */
  function enqueue(viewerId: string, task: (connection: PeerConnectionLike) => Promise<void>) {
    const viewer = viewers.get(viewerId)
    if (!viewer) return
    viewer.queue = viewer.queue.then(async () => {
      if (viewers.get(viewerId) !== viewer) return
      try {
        await task(viewer.connection)
      } catch {
        remove(viewerId)
      }
    })
  }

  return {
    has: (viewerId) => viewers.has(viewerId),

    add(viewerId, stream) {
      const connection = deps.createPeerConnection()
      viewers.set(viewerId, { connection, queue: Promise.resolve() })
      stream.getTracks().forEach((track) => connection.addTrack(track, stream))
      connection.onIceCandidate((candidate) => {
        if (viewers.get(viewerId)?.connection === connection) {
          deps.send(candidateTo(viewerId, candidate))
        }
      })
      connection.onFailed(() => {
        if (viewers.get(viewerId)?.connection === connection) remove(viewerId)
      })
      enqueue(viewerId, async () => {
        const offer = await connection.createOffer()
        await connection.setLocalDescription(offer)
        deps.send(offerTo(viewerId, offer.sdp))
      })
    },

    remove,

    receiveAnswer(viewerId, sdp) {
      enqueue(viewerId, (connection) => connection.setRemoteDescription({ type: 'answer', sdp }))
    },

    receiveCandidate(viewerId, candidate) {
      enqueue(viewerId, (connection) => connection.addIceCandidate(candidate))
    },

    closeAll() {
      viewers.forEach((viewer) => viewer.connection.close())
      viewers.clear()
    },
  }
}
