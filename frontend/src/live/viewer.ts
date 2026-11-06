// 시청 모듈. React와 무관하고, 시그널링 연결과 PeerConnection 생성은 바깥에서 받는다(deps).
import type { PeerConnectionLike } from './peer'
import {
  MessageType,
  VIEW_FAILURE_MESSAGE,
  VIEW_NOT_BROADCASTING_MESSAGE,
  answerFromViewer,
  candidateFromViewer,
  joinViewer,
  parseViewerInbound,
  viewerRejection,
  type SignalingChannel,
  type SignalingHandlers,
  type SignalMessage,
} from './signaling-protocol'

export type ViewerState =
  | { phase: 'connecting' }
  | { phase: 'playing'; stream: MediaStream }
  | { phase: 'ended' }
  | { phase: 'full' }
  /** message는 화면에 그대로 보여 줄 실패 이유다. */
  | { phase: 'failed'; message: string }

type SettledState = Extract<ViewerState, { phase: 'ended' | 'full' | 'failed' }>

function failed(message: string): SettledState {
  return { phase: 'failed', message }
}

export interface ViewerDeps {
  openSignaling(broadcastId: number, handlers: SignalingHandlers): Promise<SignalingChannel>
  createPeerConnection(): PeerConnectionLike
  /** 일정 시간 뒤에 callback을 부른다. 돌려주는 함수로 취소한다. 없으면 setTimeout을 쓴다. */
  schedule?: (callback: () => void, delayMs: number) => () => void
}

/** 송출이 연결되기 전에 들어오면 이 간격으로 다시 접속하고, 이 시간이 지나면 포기한다. */
export const RETRY_INTERVAL_MS = 3000
export const RETRY_LIMIT_MS = 30_000
const MAX_RETRIES = RETRY_LIMIT_MS / RETRY_INTERVAL_MS

function defaultSchedule(callback: () => void, delayMs: number) {
  const timer = setTimeout(callback, delayMs)
  return () => clearTimeout(timer)
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
  let cancelRetry: (() => void) | null = null
  let retries = 0
  const schedule = deps.schedule ?? defaultSchedule
  // 같은 연결에 대한 협상 단계(offer, candidate)를 도착한 순서대로 하나씩 처리한다.
  let queue: Promise<void> = Promise.resolve()

  function set(next: ViewerState) {
    current = next
    listeners.forEach((listener) => listener())
  }

  function teardown() {
    cancelRetry?.()
    cancelRetry = null
    const openChannel = channel
    const connection = peer
    channel = null
    peer = null
    queue = Promise.resolve()
    openChannel?.close()
    connection?.close()
  }

  /** 끝났거나 실패했다. 연결을 정리하고 해당 상태로 바꾼다. 이미 끝난 뒤에는 바꾸지 않는다. */
  function settle(next: SettledState) {
    if (current.phase === 'ended' || current.phase === 'failed' || current.phase === 'full') return
    teardown()
    set(next)
  }

  function enqueue(session: number, task: () => Promise<void>) {
    queue = queue.then(async () => {
      if (session !== generation) return
      try {
        await task()
      } catch {
        if (session === generation) settle(failed(VIEW_FAILURE_MESSAGE))
      }
    })
  }

  function connection(session: number): PeerConnectionLike {
    if (peer) return peer
    const created = deps.createPeerConnection()
    peer = created
    created.onIceCandidate((candidate) => {
      if (session === generation) channel?.send(candidateFromViewer(candidate))
    })
    created.onTrack((stream) => {
      if (session === generation && current.phase === 'connecting') set({ phase: 'playing', stream })
    })
    created.onFailed(() => {
      if (session === generation) settle(failed(VIEW_FAILURE_MESSAGE))
    })
    return created
  }

  function handle(session: number, raw: SignalMessage) {
    if (session !== generation) return
    const message = parseViewerInbound(raw)
    switch (message?.type) {
      case MessageType.Offer: {
        const { sdp } = message
        enqueue(session, async () => {
          const pc = connection(session)
          await pc.setRemoteDescription({ type: 'offer', sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          channel?.send(answerFromViewer(answer.sdp))
        })
        break
      }
      case MessageType.Candidate: {
        const { candidate } = message
        enqueue(session, async () => {
          await connection(session).addIceCandidate(candidate)
        })
        break
      }
      case MessageType.Rejected: {
        const rejection = viewerRejection(message.reason)
        if (rejection.action === 'retry') retryLater(session)
        else settle(rejection.action === 'fail' ? failed(rejection.message) : { phase: rejection.action })
        break
      }
      case MessageType.Ended:
        settle({ phase: 'ended' })
        break
    }
  }

  /** 송출이 아직 연결되지 않았다. 연결 중으로 둔 채 잠시 뒤 다시 접속하고, 정해진 횟수가 지나면 실패로 본다. */
  function retryLater(session: number) {
    if (current.phase !== 'connecting') return
    if (retries >= MAX_RETRIES) {
      settle(failed(VIEW_NOT_BROADCASTING_MESSAGE))
      return
    }
    retries += 1
    const stale = channel
    channel = null
    stale?.close()
    cancelRetry = schedule(() => {
      cancelRetry = null
      if (session === generation) connect(session)
    }, RETRY_INTERVAL_MS)
  }

  function connect(session: number) {
    deps
      .openSignaling(broadcastId, {
        onMessage: (message) => handle(session, message),
        onClose() {
          if (session === generation) settle(failed(VIEW_FAILURE_MESSAGE))
        },
      })
      .then((opened) => {
        if (session !== generation) {
          opened.close()
          return
        }
        channel = opened
        opened.send(joinViewer())
      })
      .catch(() => {
        if (session === generation) settle(failed(VIEW_FAILURE_MESSAGE))
      })
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
      retries = 0
      set({ phase: 'connecting' })
      connect(session)
    },

    dispose() {
      generation += 1
      teardown()
      current = { phase: 'connecting' }
    },
  }
}
