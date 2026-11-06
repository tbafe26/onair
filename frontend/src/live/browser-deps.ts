import { decodeFailure, startLiveBroadcast } from '../api/broadcasts'
import {
  START_FAILURE_MESSAGE,
  StartRejectedError,
  type BroadcasterDeps,
  type SignalingChannel,
  type SignalingHandlers,
} from './broadcaster'
import { createBrowserPeerConnection } from './peer'
import type { ViewerDeps } from './viewer'

function signalingUrl(broadcastId: number): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${window.location.host}/api/broadcasts/${broadcastId}/signal`
}

// 송출 키는 연결한 뒤 첫 메시지로만 보낸다. 주소에는 넣지 않는다.
function openSignaling(broadcastId: number, handlers: SignalingHandlers): Promise<SignalingChannel> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(signalingUrl(broadcastId))
    let manuallyClosed = false
    socket.addEventListener('open', () =>
      resolve({
        send: (message) => socket.send(JSON.stringify(message)),
        close: () => {
          manuallyClosed = true
          socket.close()
        },
      }),
    )
    socket.addEventListener('error', () => reject(new Error('시그널링 서버에 연결하지 못했습니다')))
    socket.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string') return
      try {
        const parsed: unknown = JSON.parse(event.data)
        if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
          handlers.onMessage(parsed as { type: string })
        }
      } catch {
        // 알아볼 수 없는 메시지는 무시한다.
      }
    })
    socket.addEventListener('close', () => {
      if (!manuallyClosed) handlers.onClose()
    })
  })
}

async function startLive(input: { title: string; thumbnail: Blob | null }) {
  try {
    return await startLiveBroadcast(input)
  } catch (error) {
    const failure = decodeFailure(error)
    if (failure.kind === 'invalid') {
      throw new StartRejectedError(Object.values(failure.fieldErrors)[0], failure.fieldErrors)
    }
    throw new Error(START_FAILURE_MESSAGE, { cause: error })
  }
}

/** 실제 브라우저 API를 송출 모듈에 연결한다. 서버 주소와 송출 키는 로그에 남기지 않는다. */
export const browserBroadcasterDeps: BroadcasterDeps = {
  getUserMedia:
    window.isSecureContext && navigator.mediaDevices?.getUserMedia
      ? (constraints) => navigator.mediaDevices.getUserMedia(constraints)
      : null,
  enumerateDevices: navigator.mediaDevices?.enumerateDevices
    ? () => navigator.mediaDevices.enumerateDevices()
    : undefined,
  startLive,
  openSignaling,
  createPeerConnection: createBrowserPeerConnection,
  now: () => Date.now(),
  requestWakeLock:
    'wakeLock' in navigator ? () => navigator.wakeLock.request('screen') : undefined,
  watchVisible: (listener) => {
    const onChange = () => {
      if (document.visibilityState === 'visible') listener()
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  },
}

/** 실제 브라우저 API를 시청 모듈에 연결한다. */
export const browserViewerDeps: ViewerDeps = {
  openSignaling,
  createPeerConnection: createBrowserPeerConnection,
}
