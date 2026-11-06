import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { broadcastKeys } from '../api/broadcast-keys'
import {
  decodeFailure,
  fetchBroadcast,
  type LiveBroadcastDetail,
  type RecordingBroadcastDetail,
} from '../api/broadcasts'
import { MoreBroadcastsPanel } from '../components/MoreBroadcastsPanel'
import { Button } from '../components/ui/button'
import { VideoPlayer } from '../components/VideoPlayer'
import { formatDateTime } from '../lib/format'
import { browserViewerDeps } from '../live/browser-deps'
import { useLiveViewer } from '../live/useLiveViewer'

export function BroadcastDetailPage() {
  const { id = '' } = useParams()
  const { data, isPending, error } = useQuery({
    queryKey: broadcastKeys.detail(id),
    queryFn: () => fetchBroadcast(id),
  })

  if (isPending) return <p>불러오는 중...</p>

  if (error) {
    const notFound = decodeFailure(error).kind === 'notFound'
    return (
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-[28px] font-extrabold text-foreground">
          {notFound ? '방송을 찾을 수 없습니다' : '방송을 불러오지 못했습니다'}
        </h1>
        <Button asChild>
          <Link to="/">목록으로 돌아가기</Link>
        </Button>
      </section>
    )
  }

  // 종류마다 모양이 다르므로 kind로 좁힌 뒤 video를 쓴다. 종류가 늘면 여기서 타입 오류가 난다.
  switch (data.kind) {
    case 'RECORDING':
      return <RecordingDetail broadcast={data} />
    case 'LIVE':
      return <LiveDetail broadcast={data} />
  }
}

function RecordingDetail({ broadcast: data }: { broadcast: RecordingBroadcastDetail }) {
  // 넓은 화면은 플레이어 | 368px 패널, 1024px 미만이면 패널이 플레이어 아래로 내려간다.
  return (
    // 플레이어가 본문 가장자리까지 닿도록 본문 여백을 상쇄한다.
    <div className="-mx-5 -mt-8 flex flex-col lg:flex-row lg:items-start">
      <section className="min-w-0 flex-1">
        <VideoPlayer
          source={{
            src: data.video.url,
            type: data.video.contentType,
            poster: data.video.thumbnailUrl,
          }}
        />
        <div className="px-5">
          <h1 className="mt-4 truncate text-[28px] font-extrabold text-foreground" title={data.title}>
            {data.title}
          </h1>
          <p className="mt-2 text-sub">
            <time dateTime={data.createdAt}>{formatDateTime(data.createdAt)}</time>
          </p>
        </div>
      </section>
      <div className="w-full shrink-0 px-5 pt-5 lg:w-[368px]">
        <MoreBroadcastsPanel currentId={data.id} />
      </div>
    </div>
  )
}

/** 라이브방송 상세. 방송 중이면 WebRTC로 영상을 받아 보여 주고, 종료됐으면 종료 안내를 보여 준다. */
function LiveDetail({ broadcast: data }: { broadcast: LiveBroadcastDetail }) {
  const onAir = data.status === 'ON_AIR'
  return (
    <div className="-mx-5 -mt-8 flex flex-col lg:flex-row lg:items-start">
      <section className="min-w-0 flex-1">
        {onAir ? <LiveViewer key={data.id} broadcastId={data.id} /> : <LiveStatusBox text={ENDED_TEXT} />}
        <div className="px-5">
          <h1 className="mt-4 truncate text-[28px] font-extrabold text-foreground" title={data.title}>
            {data.title}
          </h1>
          <p className="mt-2 text-sub">
            시작 <time dateTime={data.createdAt}>{formatDateTime(data.createdAt)}</time>
          </p>
          {data.endedAt && (
            <p className="mt-1 text-sub">
              종료 <time dateTime={data.endedAt}>{formatDateTime(data.endedAt)}</time>
            </p>
          )}
        </div>
      </section>
      <div className="w-full shrink-0 px-5 pt-5 lg:w-[368px]">
        <MoreBroadcastsPanel currentId={data.id} />
      </div>
    </div>
  )
}

const ENDED_TEXT = '방송이 종료되었습니다'

function LiveStatusBox({ text }: { text: string }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center bg-black text-white">
      <p role="status" className="px-5 text-center text-lg font-semibold">
        {text}
      </p>
    </div>
  )
}

/** 방송 중인 라이브방송의 영상 영역. 소리 없이 자동 재생하고, 버튼으로 소리를 켠다. */
function LiveViewer({ broadcastId }: { broadcastId: number }) {
  const viewer = useLiveViewer(browserViewerDeps, broadcastId)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [soundOn, setSoundOn] = useState(false)
  const stream = viewer.phase === 'playing' ? viewer.stream : null

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  if (viewer.phase === 'connecting') return <LiveStatusBox text="연결 중…" />
  if (viewer.phase === 'ended') return <LiveStatusBox text={ENDED_TEXT} />
  if (viewer.phase === 'failed') {
    return <LiveStatusBox text="연결하지 못했습니다. 잠시 뒤 새로고침해 다시 시도해 주세요." />
  }
  return (
    <div className="relative aspect-video w-full bg-black">
      <video
        ref={videoRef}
        aria-label="라이브 영상"
        muted={!soundOn}
        autoPlay
        playsInline
        className="h-full w-full object-contain"
      />
      {!soundOn && (
        <Button className="absolute right-3 bottom-3" onClick={() => setSoundOn(true)}>
          소리 켜기
        </Button>
      )}
    </div>
  )
}
