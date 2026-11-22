import { endBroadcast, fetchBroadcast, startLiveBroadcast } from '../api/broadcasts'
import { fetchComments, postComment } from '../api/comments'
import { parseChatMessage } from './chat-protocol'
import { openJsonSocket } from './json-socket'
import type { ChatDeps } from './chat'
import type { BroadcasterDeps } from './broadcaster'
import type { ViewerDeps } from './viewer'
import { playHls } from './hls-playback'
import { publishWhip } from './whip'

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
  endLive: endBroadcast,
  publish: publishWhip,
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
  playlistReady: (url) => fetch(url, { method: 'HEAD', cache: 'no-store' }).then((response) => response.ok),
  isOnAir: (broadcastId) =>
    fetchBroadcast(String(broadcastId)).then((broadcast) => broadcast.kind === 'LIVE' && broadcast.status === 'ON_AIR'),
  play: playHls,
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
