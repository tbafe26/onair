// 고른 영상 파일에서 재생 시간과 썸네일을 뽑는 모듈.
// 브라우저 미디어 API(video, canvas)를 쓰므로 jsdom 테스트에서는 이 모듈만 대체한다.

export interface VideoMetadata {
  durationSeconds: number
  /** 16:9 JPEG(가로 640px). 만들지 못하면 null이다. */
  thumbnail: Blob | null
  /** 썸네일 미리보기용 주소. 쓰고 나면 releasePreview로 돌려준다. */
  previewUrl: string | null
}

/** 브라우저가 영상 메타데이터를 읽지 못했다. */
export class VideoUnreadableError extends Error {
  constructor() {
    super('이 브라우저에서 재생할 수 없는 영상입니다')
    this.name = 'VideoUnreadableError'
  }
}

const THUMBNAIL_WIDTH = 640
const THUMBNAIL_HEIGHT = 360
const MAX_SEEK_SECONDS = 5
// 장면 콜백을 기다리는 최대 시간. 실측에서는 250~370ms 안에 왔다.
const FRAME_WAIT_MS = 1000

/** 영상 길이의 10% 지점(최대 5초)의 장면을 썸네일로 쓴다. 메타데이터를 못 읽으면 VideoUnreadableError다. */
export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  const objectUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
  video.src = objectUrl

  try {
    await waitFor(video, 'loadedmetadata')
    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0) throw new VideoUnreadableError()

    const thumbnail = await captureFrame(video, Math.min(duration * 0.1, MAX_SEEK_SECONDS))
    const previewUrl = thumbnail ? URL.createObjectURL(thumbnail) : null
    return { durationSeconds: duration, thumbnail, previewUrl }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}

export function releasePreview(previewUrl: string | null) {
  if (previewUrl) URL.revokeObjectURL(previewUrl)
}

function waitFor(video: HTMLVideoElement, eventName: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, onDone)
      video.removeEventListener('error', onError)
    }
    const onDone = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new VideoUnreadableError())
    }
    video.addEventListener(eventName, onDone)
    video.addEventListener('error', onError)
  })
}

/**
 * 다음 장면이 화면에 나올 때까지 기다린다. requestVideoFrameCallback이 없으면 애니메이션 프레임 두 번을 기다린다.
 * 콜백이 오지 않는 경우(숨은 탭 등)에도 멈추지 않도록 FRAME_WAIT_MS 뒤에는 그냥 진행한다.
 */
function waitForFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, FRAME_WAIT_MS)
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(done)
    else requestAnimationFrame(() => requestAnimationFrame(done))
  })
}

// 장면을 못 그려도 재생 시간은 알았으므로 등록은 막지 않는다(썸네일 없이 등록된다).
async function captureFrame(video: HTMLVideoElement, seekTo: number): Promise<Blob | null> {
  try {
    // seeked 직후에는 장면이 아직 준비되지 않아 그리면 통째로 검은 썸네일이 된다(Chrome에서 확인).
    // 탐색한 장면이 실제로 나온 뒤에 그리도록, 탐색 전에 장면 콜백을 걸어 두고 함께 기다린다.
    const frameReady = waitForFrame(video)
    const seeked = waitFor(video, 'seeked')
    video.currentTime = seekTo
    await seeked
    await frameReady

    const canvas = document.createElement('canvas')
    canvas.width = THUMBNAIL_WIDTH
    canvas.height = THUMBNAIL_HEIGHT
    const context = canvas.getContext('2d')
    if (!context || video.videoWidth === 0) return null

    // 16:9 안에 영상 비율을 유지하며 맞추고 남는 곳은 검게 둔다.
    context.fillStyle = '#000'
    context.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
    const scale = Math.min(THUMBNAIL_WIDTH / video.videoWidth, THUMBNAIL_HEIGHT / video.videoHeight)
    const width = video.videoWidth * scale
    const height = video.videoHeight * scale
    context.drawImage(
      video,
      (THUMBNAIL_WIDTH - width) / 2,
      (THUMBNAIL_HEIGHT - height) / 2,
      width,
      height,
    )
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
  } catch {
    return null
  }
}
