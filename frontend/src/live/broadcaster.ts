// 송출 모듈. React와 무관하고, 카메라 열기·방송 시작·시그널링 연결은 바깥에서 받는다(deps).
// 실제로는 브라우저 API(browser-deps.ts)를, 테스트에서는 가짜를 넣는다.
import type { PeerConnectionLike } from './peer'

export type CameraUnavailableReason = 'denied' | 'notFound' | 'insecure'

export type BroadcasterState =
  | { phase: 'requestingCamera' }
  | { phase: 'cameraUnavailable'; reason: CameraUnavailableReason }
  /** startFailure는 직전 송출 시작이 실패한 이유다. 미리보기로 돌아와 다시 시도할 수 있다. */
  | { phase: 'previewing'; stream: MediaStream; startFailure: string | null }
  | { phase: 'starting'; stream: MediaStream }
  | { phase: 'onAir'; stream: MediaStream; broadcastId: number; startedAt: number; viewerCount: number; maxViewers: number | null }
  | { phase: 'ended'; broadcastId: number }

export interface SignalMessage {
  type: string
  [field: string]: unknown
}

export interface SignalingChannel {
  send(message: SignalMessage): void
  close(): void
}

export interface SignalingHandlers {
  onMessage(message: SignalMessage): void
  /** 서버가 닫았거나 연결이 끊겼다. close()를 직접 부른 경우에는 호출하지 않는다. */
  onClose(): void
}

export interface WakeLockHandle {
  release(): Promise<void>
}

export interface BroadcasterDeps {
  /** 보안 컨텍스트가 아니면 카메라를 쓸 수 없으므로 null이다. */
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null
  /** 라이브방송을 만든다. 실패하면 사용자에게 보여 줄 메시지를 담은 Error를 던진다. */
  startLive(input: { title: string; thumbnail: Blob | null }): Promise<{ id: number; streamKey: string }>
  openSignaling(broadcastId: number, handlers: SignalingHandlers): Promise<SignalingChannel>
  /** 시청자마다 PeerConnection을 만든다. */
  createPeerConnection(): PeerConnectionLike
  now(): number
  /** 송출 중 화면이 꺼지지 않게 잠근다. 지원하지 않으면 없다. */
  requestWakeLock?: () => Promise<WakeLockHandle>
  /** 화면이 다시 보일 때마다 listener를 부른다. 돌려주는 함수로 구독을 푼다. 지원하지 않으면 없다. */
  watchVisible?: (listener: () => void) => () => void
}

export interface LiveBroadcaster {
  state(): BroadcasterState
  subscribe(listener: () => void): () => void
  /** 카메라를 연다. dispose 뒤에 다시 부르면 처음부터 다시 시작한다. */
  open(): void
  start(input: { title: string; thumbnail: Blob | null }): Promise<void>
  /** 서버가 종료를 확인하면(또는 연결이 끊기면) 카메라를 끄고 ended가 된다. */
  end(): Promise<void>
  /** 화면을 떠난다. 카메라를 끄고 연결을 닫으며, 송출 중이었다면 서버가 연결 끊김으로 방송을 종료한다. */
  dispose(): void
}

const END_CONFIRM_TIMEOUT_MS = 5000
const HEARTBEAT_INTERVAL_MS = 10_000
const START_FAILURE_MESSAGE = '송출을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'

function classifyCameraError(error: unknown): CameraUnavailableReason {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  return 'notFound'
}

function stopTracks(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop())
}

export function createLiveBroadcaster(deps: BroadcasterDeps): LiveBroadcaster {
  let current: BroadcasterState = { phase: 'requestingCamera' }
  const listeners = new Set<() => void>()
  // open과 dispose마다 올린다. 늦게 끝난 비동기 작업이 이미 정리된 세션을 건드리지 않게 거른다.
  let generation = 0
  let channel: SignalingChannel | null = null
  let wakeLock: WakeLockHandle | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let stopWatchingVisible: (() => void) | null = null
  // 시청자 번호 -> 그 시청자와의 연결. queue는 협상 단계를 도착한 순서대로 하나씩 처리하게 한다.
  const viewers = new Map<string, { connection: PeerConnectionLike; queue: Promise<void> }>()
  let pendingJoin: { resolve(): void; reject(error: Error): void } | null = null
  let pendingEnd: { promise: Promise<void>; resolve(): void; timer: ReturnType<typeof setTimeout> } | null = null

  function set(next: BroadcasterState) {
    current = next
    listeners.forEach((listener) => listener())
  }

  function streamOf(state: BroadcasterState): MediaStream | null {
    return 'stream' in state ? state.stream : null
  }

  function releaseWakeLock() {
    const lock = wakeLock
    wakeLock = null
    if (lock) void lock.release().catch(() => undefined)
  }

  /** 화면 꺼짐 방지를 요청한다. 지원하지 않거나 거절되면 조용히 건너뛴다. */
  function acquireWakeLock(session: number) {
    if (!deps.requestWakeLock) return
    void deps.requestWakeLock().then(
      (lock) => {
        if (session === generation && current.phase === 'onAir') {
          // 이미 잡고 있던 잠금이 있으면 새 잠금으로 바꾼다.
          const previous = wakeLock
          wakeLock = lock
          if (previous) void previous.release().catch(() => undefined)
        } else {
          void lock.release().catch(() => undefined)
        }
      },
      () => undefined,
    )
  }

  /** 송출 중에는 연락이 끊기지 않았음을 서버에 알리고, 화면이 다시 보이면 화면 꺼짐 방지를 다시 요청한다. */
  function startKeepAlive(session: number) {
    heartbeatTimer = setInterval(() => channel?.send({ type: 'heartbeat' }), HEARTBEAT_INTERVAL_MS)
    // 브라우저는 화면이 가려지면 잠금을 스스로 풀기 때문에 다시 보일 때 새로 요청한다.
    stopWatchingVisible =
      deps.watchVisible?.(() => {
        if (session === generation && current.phase === 'onAir') acquireWakeLock(session)
      }) ?? null
  }

  function stopKeepAlive() {
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
    heartbeatTimer = null
    stopWatchingVisible?.()
    stopWatchingVisible = null
  }

  function closeViewer(viewerId: string) {
    viewers.get(viewerId)?.connection.close()
    viewers.delete(viewerId)
  }

  function closeAllViewers() {
    viewers.forEach((viewer) => viewer.connection.close())
    viewers.clear()
  }

  /** 시청자 한 명과의 협상 단계를 그 시청자의 순서 뒤에 붙인다. 실패하면 그 시청자의 연결만 닫는다. */
  function enqueue(viewerId: string, task: (connection: PeerConnectionLike) => Promise<void>) {
    const viewer = viewers.get(viewerId)
    if (!viewer) return
    viewer.queue = viewer.queue.then(async () => {
      if (viewers.get(viewerId) !== viewer) return
      try {
        await task(viewer.connection)
      } catch {
        closeViewer(viewerId)
      }
    })
  }

  function offerTo(viewerId: string, stream: MediaStream) {
    const connection = deps.createPeerConnection()
    viewers.set(viewerId, { connection, queue: Promise.resolve() })
    stream.getTracks().forEach((track) => connection.addTrack(track, stream))
    connection.onIceCandidate((candidate) => {
      if (viewers.get(viewerId)?.connection === connection) {
        channel?.send({ type: 'candidate', to: viewerId, candidate })
      }
    })
    connection.onFailed(() => {
      if (viewers.get(viewerId)?.connection === connection) closeViewer(viewerId)
    })
    enqueue(viewerId, async () => {
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      channel?.send({ type: 'offer', to: viewerId, sdp: offer.sdp })
    })
  }

  function handleViewerMessage(message: SignalMessage) {
    const viewerId = message.type === 'viewer-joined' || message.type === 'viewer-left' ? message.viewerId : message.from
    if (typeof viewerId !== 'string') return
    switch (message.type) {
      case 'viewer-joined':
        if (current.phase === 'onAir' && !viewers.has(viewerId)) offerTo(viewerId, current.stream)
        break
      case 'viewer-left':
        closeViewer(viewerId)
        break
      case 'answer': {
        const sdp = message.sdp
        if (typeof sdp === 'string') {
          enqueue(viewerId, (connection) => connection.setRemoteDescription({ type: 'answer', sdp }))
        }
        break
      }
      case 'candidate': {
        const candidate = message.candidate
        if (typeof candidate === 'object' && candidate !== null) {
          enqueue(viewerId, (connection) => connection.addIceCandidate(candidate as RTCIceCandidateInit))
        }
        break
      }
    }
  }

  function closeChannel() {
    const open = channel
    channel = null
    open?.close()
  }

  /** 송출이 끝났다. 카메라와 마이크를 끄고 ended로 바꾼다. */
  function finish(broadcastId: number) {
    const stream = streamOf(current)
    if (stream) stopTracks(stream)
    stopKeepAlive()
    releaseWakeLock()
    closeAllViewers()
    closeChannel()
    if (pendingEnd) {
      clearTimeout(pendingEnd.timer)
      pendingEnd.resolve()
      pendingEnd = null
    }
    set({ phase: 'ended', broadcastId })
  }

  async function openCamera(session: number) {
    if (!deps.getUserMedia) {
      set({ phase: 'cameraUnavailable', reason: 'insecure' })
      return
    }
    try {
      const stream = await deps.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      if (session !== generation) {
        stopTracks(stream)
        return
      }
      set({ phase: 'previewing', stream, startFailure: null })
    } catch (error) {
      if (session !== generation) return
      set({ phase: 'cameraUnavailable', reason: classifyCameraError(error) })
    }
  }

  function joinAsBroadcaster(broadcastId: number, streamKey: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      pendingJoin = { resolve, reject }
      deps
        .openSignaling(broadcastId, {
          onMessage(message) {
            if (message.type === 'joined') {
              pendingJoin?.resolve()
              pendingJoin = null
            } else if (message.type === 'rejected') {
              pendingJoin?.reject(new Error(START_FAILURE_MESSAGE))
              pendingJoin = null
            } else if (message.type === 'ended' && current.phase === 'onAir') {
              finish(current.broadcastId)
            } else if (message.type === 'viewer-count' && current.phase === 'onAir') {
              const count = message.count
              const max = message.max
              if (typeof count === 'number') {
                set({ ...current, viewerCount: count, maxViewers: typeof max === 'number' ? max : current.maxViewers })
              }
            } else {
              handleViewerMessage(message)
            }
          },
          onClose() {
            if (pendingJoin) {
              pendingJoin.reject(new Error(START_FAILURE_MESSAGE))
              pendingJoin = null
            } else if (current.phase === 'onAir') {
              // 연결이 끊기면 서버가 방송을 종료하므로 화면도 종료로 맞춘다.
              finish(current.broadcastId)
            }
          },
        })
        .then((opened) => {
          channel = opened
          opened.send({ type: 'join-broadcaster', streamKey })
        })
        .catch((error: unknown) => {
          pendingJoin = null
          reject(error instanceof Error ? error : new Error(START_FAILURE_MESSAGE))
        })
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

    open() {
      generation += 1
      current = { phase: 'requestingCamera' }
      listeners.forEach((listener) => listener())
      void openCamera(generation)
    },

    async start(input) {
      // 송출을 시작하는 동안과 방송 중에는 다시 시작하지 않는다.
      if (current.phase !== 'previewing') return
      const session = generation
      const { stream } = current
      set({ phase: 'starting', stream })
      try {
        const started = await deps.startLive(input)
        if (session !== generation) return
        await joinAsBroadcaster(started.id, started.streamKey)
        if (session !== generation) return
        set({ phase: 'onAir', stream, broadcastId: started.id, startedAt: deps.now(), viewerCount: 0, maxViewers: null })
        startKeepAlive(session)
        acquireWakeLock(session)
      } catch (error) {
        closeChannel()
        if (session !== generation) return
        const message = error instanceof Error && error.message ? error.message : START_FAILURE_MESSAGE
        set({ phase: 'previewing', stream, startFailure: message })
      }
    },

    end() {
      if (pendingEnd) return pendingEnd.promise
      if (current.phase !== 'onAir' || !channel) return Promise.resolve()
      const { broadcastId } = current
      let resolve = () => {}
      const promise = new Promise<void>((done) => {
        resolve = done
      })
      const timer = setTimeout(() => finish(broadcastId), END_CONFIRM_TIMEOUT_MS)
      pendingEnd = { promise, resolve, timer }
      channel.send({ type: 'end' })
      return promise
    },

    dispose() {
      generation += 1
      const stream = streamOf(current)
      if (stream) stopTracks(stream)
      stopKeepAlive()
      releaseWakeLock()
      closeAllViewers()
      closeChannel()
      pendingJoin = null
      if (pendingEnd) {
        clearTimeout(pendingEnd.timer)
        pendingEnd.resolve()
        pendingEnd = null
      }
      current = { phase: 'requestingCamera' }
    },
  }
}
