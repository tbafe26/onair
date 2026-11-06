import { startLiveBroadcast } from '../api/broadcasts'
import { fetchComments, postComment } from '../api/comments'
import { parseChatMessage } from './chat-protocol'
import { openJsonSocket } from './json-socket'
import type { ChatDeps } from './chat'
import type { BroadcasterDeps } from './broadcaster'
import { createBrowserPeerConnection } from './peer'
import { asSignalMessage, type SignalingChannel, type SignalingHandlers } from './signaling-protocol'
import type { ViewerDeps } from './viewer'

// 송출 키는 연결한 뒤 첫 메시지로만 보낸다. 주소에는 넣지 않는다.
function openSignaling(broadcastId: number, handlers: SignalingHandlers): Promise<SignalingChannel> {
  return openJsonSocket(
    `/api/broadcasts/${broadcastId}/signal`,
    asSignalMessage,
    handlers,
    '시그널링 서버에 연결하지 못했습니다',
  )
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
  startLive: startLiveBroadcast,
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

/** 실제 브라우저 API를 채팅 모듈에 연결한다. 채팅 WebSocket은 받기만 하고, 쓰기는 REST로 한다. */
export const browserChatDeps: ChatDeps = {
  openChat: (broadcastId, handlers) =>
    openJsonSocket(
      `/api/broadcasts/${broadcastId}/chat`,
      parseChatMessage,
      handlers,
      '채팅 서버에 연결하지 못했습니다',
    ),
  fetchPage: (broadcastId, before) => fetchComments(broadcastId, before),
  postComment,
}
