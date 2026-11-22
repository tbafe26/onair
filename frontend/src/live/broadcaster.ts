// 송출 모듈. React와 무관하고, 카메라 열기·방송 시작·종료·영상 송출은 바깥에서 받는다(deps).
// 실제로는 브라우저 API(browser-deps.ts)를, 테스트에서는 가짜를 넣는다.
import { decodeFailure, type ApiFailure } from '../api/broadcasts'
import { createKeepAlive, type WakeLockHandle } from './keep-alive'

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
 * 영상 송출 단계의 실패는 사용자에게 보여 줄 문구다.
 */
export type StartFailure = ApiFailure | { kind: 'message'; message: string }

export type { WakeLockHandle }

/** 미디어 서버로 보내는 영상 연결(WHIP). */
export interface Publication {
  /** 연결이 복구되지 않을 만큼 끊겼다. */
  onFailed(listener: () => void): void
  close(): void
}

export const PUBLISH_FAILURE_MESSAGE = '영상을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.'

export interface BroadcasterDeps {
  /** 보안 컨텍스트가 아니면 카메라를 쓸 수 없으므로 null이다. */
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null
  /** 라이브방송을 만든다. 요청이 실패하면 그 오류를 그대로 던지고, 송출 모듈이 ApiFailure로 푼다. */
  startLive(input: { title: string; thumbnail: Blob | null }): Promise<{ id: number; streamKey: string }>
  /** 라이브방송을 종료한다. 이미 종료됐어도 성공이다. */
  endLive(broadcastId: number): Promise<void>
  /** 카메라 영상을 미디어 서버로 보낸다. 송출 키가 그 방송의 것이어야 미디어 서버가 받는다. */
  publish(broadcastId: number, streamKey: string, stream: MediaStream): Promise<Publication>
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
  /** 서버에 종료를 요청하고 카메라를 끈 뒤 ended가 된다. 요청이 실패해도 ended가 된다. */
  end(): Promise<void>
  /** 화면을 떠난다. 카메라와 영상 연결을 닫고, 송출 중이었다면 종료를 요청한다. */
  dispose(): void
}
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
  let publication: Publication | null = null
  const keepAlive = createKeepAlive({
    requestWakeLock: deps.requestWakeLock,
    watchVisible: deps.watchVisible,
  })
  let pendingEnd: Promise<void> | null = null

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

  /** 종료 요청은 실패해도 넘어간다. 영상 연결을 닫으면 서버가 송출이 끊긴 것을 보고 방송을 정리한다. */
  function requestEnd(broadcastId: number): Promise<void> {
    return deps.endLive(broadcastId).catch(() => undefined)
  }

  /** 카메라, 화면 잠금, 영상 연결을 모두 정리한다. finish와 dispose가 함께 쓴다. */
  function teardown() {
    const stream = streamOf(current)
    if (stream) stopTracks(stream)
    keepAlive.stop()
    publication?.close()
    publication = null
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
      let published: Publication
      try {
        published = await deps.publish(started.id, started.streamKey, stream)
      } catch {
        await requestEnd(started.id)
        if (session === generation) {
          set({ phase: 'previewing', stream, startFailure: { kind: 'message', message: PUBLISH_FAILURE_MESSAGE } })
        }
        return
      }
      if (session !== generation) {
        published.close()
        return
      }
      publication = published
      // 다른 곳에서 종료돼 미디어 서버가 송출을 끊은 경우도 여기로 온다.
      published.onFailed(() => {
        if (session !== generation || current.phase !== 'onAir' || pendingEnd) return
        void requestEnd(current.broadcastId)
        finish(current.broadcastId)
      })
      set({ phase: 'onAir', stream, broadcastId: started.id, startedAt: deps.now(), viewerCount: 0, maxViewers: null })
      keepAlive.start()
    },

    end() {
      if (pendingEnd) return pendingEnd
      if (current.phase !== 'onAir') return Promise.resolve()
      const { broadcastId } = current
      const session = generation
      pendingEnd = requestEnd(broadcastId).then(() => {
        pendingEnd = null
        if (session === generation) finish(broadcastId)
      })
      return pendingEnd
    },

    dispose() {
      if (current.phase === 'onAir' && !pendingEnd) void requestEnd(current.broadcastId)
      generation += 1
      teardown()
      pendingEnd = null
      current = { phase: 'requestingCamera' }
      camera = initialCamera
    },
  }
}
