// 송출 모듈. React와 무관하고, 카메라 열기·방송 시작·시그널링 연결은 바깥에서 받는다(deps).
// 실제로는 브라우저 API(browser-deps.ts)를, 테스트에서는 가짜를 넣는다.
import { decodeFailure, type ApiFailure } from '../api/broadcasts'
import { createKeepAlive, type WakeLockHandle } from './keep-alive'
import type { PeerConnectionLike } from './peer'
import {
  MessageType,
  START_FAILURE_MESSAGE,
  broadcasterRejectionMessage,
  endBroadcast,
  heartbeat,
  joinBroadcaster,
  parseBroadcasterInbound,
  type SignalingChannel,
  type SignalingHandlers,
} from './signaling-protocol'
import { createViewerConnections } from './viewer-connections'

export type CameraUnavailableReason = 'denied' | 'notFound' | 'insecure'

export type BroadcasterState =
  | { phase: 'requestingCamera' }
  | { phase: 'cameraUnavailable'; reason: CameraUnavailableReason }
  /** startFailure는 직전 송출 시작이 실패한 이유다. 미리보기로 돌아와 다시 시도할 수 있다. */
  | { phase: 'previewing'; stream: MediaStream; startFailure: StartFailure | null }
  | { phase: 'starting'; stream: MediaStream }
  | { phase: 'onAir'; stream: MediaStream; broadcastId: number; startedAt: number; viewerCount: number; maxViewers: number | null }
  | { phase: 'ended'; broadcastId: number }

/**
 * 송출 시작이 실패한 이유. 방송 만들기 요청의 실패는 서버가 알려 준 ApiFailure 그대로이고,
 * 시그널링 단계의 실패(연결, 송출자 거절)는 사용자에게 보여 줄 문구다.
 */
export type StartFailure = ApiFailure | { kind: 'message'; message: string }

export type { WakeLockHandle }

export interface BroadcasterDeps {
  /** 보안 컨텍스트가 아니면 카메라를 쓸 수 없으므로 null이다. */
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null
  /** 라이브방송을 만든다. 요청이 실패하면 그 오류를 그대로 던지고, 송출 모듈이 ApiFailure로 푼다. */
  startLive(input: { title: string; thumbnail: Blob | null }): Promise<{ id: number; streamKey: string }>
  openSignaling(broadcastId: number, handlers: SignalingHandlers): Promise<SignalingChannel>
  /** 시청자마다 PeerConnection을 만든다. */
  createPeerConnection(): PeerConnectionLike
  now(): number
  /** 카메라가 둘 이상인지 알아내는 데 쓴다. 지원하지 않거나 실패하면 전환 버튼을 두지 않는다. */
  enumerateDevices?: () => Promise<{ kind: string }[]>
  /** 송출 중 화면이 꺼지지 않게 잠근다. 지원하지 않으면 없다. */
  requestWakeLock?: () => Promise<WakeLockHandle>
  /** 화면이 다시 보일 때마다 listener를 부른다. 돌려주는 함수로 구독을 푼다. 지원하지 않으면 없다. */
  watchVisible?: (listener: () => void) => () => void
}

export type CameraFacing = 'user' | 'environment'

/** 카메라 전환에 관한 상태. 바뀔 때만 새 객체가 되므로 구독해서 읽을 수 있다. */
export interface CameraInfo {
  facing: CameraFacing
  /** 카메라가 둘 이상이다. */
  canSwitch: boolean
  switching: boolean
  /** 직전 전환이 실패한 이유. 이전 카메라로 되돌아간 상태다. */
  switchFailure: string | null
}

export interface LiveBroadcaster {
  state(): BroadcasterState
  cameraInfo(): CameraInfo
  /** 미리보기 중에만 전면과 후면을 바꾼다. 다른 단계에서는 아무 일도 하지 않는다. */
  switchCamera(): Promise<void>
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
const SWITCH_FAILURE_MESSAGE = '카메라를 바꾸지 못했습니다. 이전 카메라로 계속합니다.'

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
  const initialCamera: CameraInfo = { facing: 'user', canSwitch: false, switching: false, switchFailure: null }
  let camera = initialCamera
  const listeners = new Set<() => void>()
  // open과 dispose마다 올린다. 늦게 끝난 비동기 작업이 이미 정리된 세션을 건드리지 않게 거른다.
  let generation = 0
  let channel: SignalingChannel | null = null
  const keepAlive = createKeepAlive({
    sendHeartbeat: () => channel?.send(heartbeat()),
    intervalMs: HEARTBEAT_INTERVAL_MS,
    requestWakeLock: deps.requestWakeLock,
    watchVisible: deps.watchVisible,
  })
  const viewers = createViewerConnections({
    createPeerConnection: () => deps.createPeerConnection(),
    send: (message) => channel?.send(message),
  })
  let pendingJoin: { resolve(): void; reject(error: Error): void } | null = null
  let pendingEnd: { promise: Promise<void>; resolve(): void; timer: ReturnType<typeof setTimeout> } | null = null

  function set(next: BroadcasterState) {
    current = next
    listeners.forEach((listener) => listener())
  }

  function setCamera(patch: Partial<CameraInfo>) {
    camera = { ...camera, ...patch }
    listeners.forEach((listener) => listener())
  }

  function acquire(facing: CameraFacing) {
    return deps.getUserMedia!({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    })
  }

  /** 권한이 허용된 뒤에야 장치 목록이 채워지므로 카메라를 연 직후에 센다. */
  async function detectCameras(session: number) {
    if (!deps.enumerateDevices) return
    try {
      const devices = await deps.enumerateDevices()
      if (session === generation) {
        setCamera({ canSwitch: devices.filter((device) => device.kind === 'videoinput').length >= 2 })
      }
    } catch {
      // 알 수 없으면 전환 버튼을 두지 않는다.
    }
  }

  function streamOf(state: BroadcasterState): MediaStream | null {
    return 'stream' in state ? state.stream : null
  }

  function handleViewerMessage(message: ReturnType<typeof parseBroadcasterInbound>) {
    switch (message?.type) {
      case MessageType.ViewerJoined:
        if (current.phase === 'onAir' && !viewers.has(message.viewerId)) viewers.add(message.viewerId, current.stream)
        break
      case MessageType.ViewerLeft:
        viewers.remove(message.viewerId)
        break
      case MessageType.Answer: {
        viewers.receiveAnswer(message.viewerId, message.sdp)
        break
      }
      case MessageType.Candidate: {
        viewers.receiveCandidate(message.viewerId, message.candidate)
        break
      }
    }
  }

  function closeChannel() {
    const open = channel
    channel = null
    open?.close()
  }

  /** 카메라, 연결 유지, 시청자 연결, 시그널링 채널을 모두 정리한다. finish와 dispose가 함께 쓴다. */
  function teardown() {
    const stream = streamOf(current)
    if (stream) stopTracks(stream)
    keepAlive.stop()
    viewers.closeAll()
    closeChannel()
    if (pendingEnd) {
      clearTimeout(pendingEnd.timer)
      pendingEnd.resolve()
      pendingEnd = null
    }
  }

  /** 송출이 끝났다. 카메라와 마이크를 끄고 ended로 바꾼다. */
  function finish(broadcastId: number) {
    teardown()
    set({ phase: 'ended', broadcastId })
  }

  async function openCamera(session: number) {
    if (!deps.getUserMedia) {
      set({ phase: 'cameraUnavailable', reason: 'insecure' })
      return
    }
    try {
      const stream = await acquire('user')
      if (session !== generation) {
        stopTracks(stream)
        return
      }
      set({ phase: 'previewing', stream, startFailure: null })
      void detectCameras(session)
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
          onMessage(raw) {
            const message = parseBroadcasterInbound(raw)
            if (message?.type === MessageType.Joined) {
              pendingJoin?.resolve()
              pendingJoin = null
            } else if (message?.type === MessageType.Rejected) {
              pendingJoin?.reject(new Error(broadcasterRejectionMessage(message.reason)))
              pendingJoin = null
            } else if (message?.type === MessageType.Ended && current.phase === 'onAir') {
              finish(current.broadcastId)
            } else if (message?.type === MessageType.ViewerCount && current.phase === 'onAir') {
              set({ ...current, viewerCount: message.count, maxViewers: message.max ?? current.maxViewers })
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
          opened.send(joinBroadcaster(streamKey))
        })
        .catch((error: unknown) => {
          pendingJoin = null
          reject(error instanceof Error ? error : new Error(START_FAILURE_MESSAGE))
        })
    })
  }

  return {
    state: () => current,

    cameraInfo: () => camera,

    async switchCamera() {
      if (current.phase !== 'previewing' || camera.switching || !deps.getUserMedia) return
      const session = generation
      const previous = camera.facing
      const target: CameraFacing = previous === 'user' ? 'environment' : 'user'
      // 휴대폰은 카메라를 하나씩만 열 수 있어서 먼저 끄고 새로 연다.
      stopTracks(current.stream)
      setCamera({ switching: true, switchFailure: null })
      let next: MediaStream
      let failure: string | null = null
      let facing = target
      try {
        next = await acquire(target)
      } catch {
        // 바꾸지 못하면 이전 카메라를 다시 연다. 그것도 안 되면 카메라를 쓸 수 없는 상태다.
        failure = SWITCH_FAILURE_MESSAGE
        facing = previous
        try {
          next = await acquire(previous)
        } catch (error) {
          if (session !== generation) return
          camera = { ...camera, switching: false }
          set({ phase: 'cameraUnavailable', reason: classifyCameraError(error) })
          return
        }
      }
      if (session !== generation) {
        stopTracks(next)
        return
      }
      camera = { ...camera, facing, switching: false, switchFailure: failure }
      set({ phase: 'previewing', stream: next, startFailure: null })
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    open() {
      generation += 1
      camera = initialCamera
      current = { phase: 'requestingCamera' }
      listeners.forEach((listener) => listener())
      void openCamera(generation)
    },

    async start(input) {
      // 송출을 시작하는 동안과 방송 중에는 다시 시작하지 않는다.
      if (current.phase !== 'previewing' || camera.switching) return
      const session = generation
      const { stream } = current
      set({ phase: 'starting', stream })
      let started: { id: number; streamKey: string }
      try {
        started = await deps.startLive(input)
      } catch (error) {
        if (session === generation) set({ phase: 'previewing', stream, startFailure: decodeFailure(error) })
        return
      }
      if (session !== generation) return
      try {
        await joinAsBroadcaster(started.id, started.streamKey)
        if (session !== generation) return
        set({ phase: 'onAir', stream, broadcastId: started.id, startedAt: deps.now(), viewerCount: 0, maxViewers: null })
        keepAlive.start()
      } catch (error) {
        closeChannel()
        if (session !== generation) return
        const message = error instanceof Error && error.message ? error.message : START_FAILURE_MESSAGE
        set({ phase: 'previewing', stream, startFailure: { kind: 'message', message } })
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
      channel.send(endBroadcast())
      return promise
    },

    dispose() {
      generation += 1
      teardown()
      pendingJoin = null
      current = { phase: 'requestingCamera' }
      camera = initialCamera
    },
  }
}
