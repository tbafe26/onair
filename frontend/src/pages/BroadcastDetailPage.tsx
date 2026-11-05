import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { broadcastKeys } from '../api/broadcast-keys'
import { decodeFailure, fetchBroadcast, type RecordingBroadcastDetail } from '../api/broadcasts'
import { MoreBroadcastsPanel } from '../components/MoreBroadcastsPanel'
import { Button } from '../components/ui/button'
import { VideoPlayer } from '../components/VideoPlayer'
import { formatDateTime } from '../lib/format'

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
