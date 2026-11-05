import { useState } from 'react'

/**
 * 플레이어가 받는 소스. 1단계는 원본 파일 주소(mp4, webm)다.
 * 2단계에서 type이 HLS(application/vnd.apple.mpegurl)인 소스를 이 자리에 붙인다.
 */
export interface PlayerSource {
  src: string
  type: string
  poster?: string | null
}

/** 본문 폭을 채우는 16:9 플레이어. 재생할 수 없으면 같은 자리에 오류 안내를 보여 준다. */
export function VideoPlayer({ source }: { source: PlayerSource }) {
  // 소스가 바뀌면 오류 상태를 버린다. (렌더 중에 이전 소스와 비교해 초기화한다)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (failedSrc === source.src) {
    return (
      <div
        role="alert"
        className="flex aspect-video w-full items-center justify-center bg-card text-sub"
      >
        영상을 재생할 수 없습니다
      </div>
    )
  }

  return (
    <video
      key={source.src}
      aria-label="영상 플레이어"
      controls
      preload="metadata"
      poster={source.poster ?? undefined}
      className="aspect-video w-full bg-black"
    >
      {/* 모든 소스가 실패하면 오류 이벤트가 source 요소에서 올라온다. */}
      <source src={source.src} type={source.type} onError={() => setFailedSrc(source.src)} />
    </video>
  )
}
