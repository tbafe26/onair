// 영상 요소에 HLS 재생을 붙인다. hls.js는 시청 화면에서만 필요하므로 그때 내려받는다.
import type { HlsPlayback } from './viewer'

export function playHls(video: HTMLVideoElement, url: string): HlsPlayback {
  const fatalListeners = new Set<() => void>()
  let destroyed = false
  let destroyPlayer = () => {}
  const fail = () => {
    if (!destroyed) fatalListeners.forEach((listener) => listener())
  }

  void import('hls.js')
    .then(({ default: Hls }) => {
      if (destroyed) return
      if (Hls.isSupported()) {
        // 송출이 끝나면 미디어 서버는 조각을 지우고 재생 목록만 남겨, 목록에 적힌 조각이 404가 된다.
        // 기본값(30초 넘게 재시도) 대신 몇 초 안에 포기하고 시청 모듈이 방송 상태를 확인하게 한다.
        // 일시적인 오류였다면 시청 모듈이 처음부터 다시 연결한다.
        const giveUpQuickly = {
          default: {
            maxTimeToFirstByteMs: 10_000,
            maxLoadTimeMs: 20_000,
            timeoutRetry: { maxNumRetry: 2, retryDelayMs: 0, maxRetryDelayMs: 0 },
            errorRetry: { maxNumRetry: 2, retryDelayMs: 1000, maxRetryDelayMs: 2000 },
          },
        }
        const hls = new Hls({ playlistLoadPolicy: giveUpQuickly, fragLoadPolicy: giveUpQuickly })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) fail()
        })
        hls.loadSource(url)
        hls.attachMedia(video)
        destroyPlayer = () => hls.destroy()
        return
      }
      // MediaSource가 없는 브라우저(일부 iOS Safari)는 HLS를 직접 재생한다.
      video.addEventListener('error', fail)
      video.src = url
      destroyPlayer = () => {
        video.removeEventListener('error', fail)
        video.removeAttribute('src')
        video.load()
      }
    })
    .catch(fail)

  return {
    onFatalError: (listener) => void fatalListeners.add(listener),
    destroy() {
      destroyed = true
      destroyPlayer()
    },
  }
}
