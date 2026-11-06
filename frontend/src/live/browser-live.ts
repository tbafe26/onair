import { createLiveBroadcaster } from './broadcaster'
import { browserBroadcasterDeps, browserViewerDeps } from './browser-deps'
import type { Live } from './live-context'
import { createLiveViewer } from './viewer'

/** 실제 브라우저 API로 만든 송출·시청 모듈. LiveProvider의 기본값이다. */
export const browserLive: Live = {
  createBroadcaster: () => createLiveBroadcaster(browserBroadcasterDeps),
  createViewer: (broadcastId) => createLiveViewer(browserViewerDeps, broadcastId),
}
