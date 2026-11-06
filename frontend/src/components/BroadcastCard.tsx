import { Link } from 'react-router-dom'
import type { BroadcastSummary, LiveStatus } from '../api/broadcasts'
import { BroadcastThumbnail } from './BroadcastThumbnail'
import { BroadcastInfo } from './BroadcastInfo'
import { formatDuration } from '../lib/format'

/**
 * 방송 목록의 썸네일 카드. 누르면 방송 상세 화면으로 간다.
 * 라이브방송에는 상태 배지(방송 중은 LIVE, 종료는 종료)가 붙고 재생 시간이 없다. 녹화방송은 배지가 없다.
 */
function LiveStatusBadge({ status }: { status: LiveStatus }) {
  const onAir = status === 'ON_AIR'
  return (
    <span
      className={`absolute top-2 left-2 rounded px-1.5 py-0.5 text-[11px] font-bold text-white ${
        onAir ? 'bg-red-600' : 'bg-neutral-600'
      }`}
    >
      {onAir ? 'LIVE' : '종료'}
    </span>
  )
}

export function BroadcastCard({ broadcast }: { broadcast: BroadcastSummary }) {
  return (
    <Link to={`/broadcasts/${broadcast.id}`} className="group block outline-none">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-card">
        <BroadcastThumbnail url={broadcast.thumbnailUrl} />
        {/* 호버하면 덮개가 0.2초 동안 진해진다. */}
        <div className="absolute inset-0 bg-black/0 transition-colors duration-200 ease-[cubic-bezier(0.65,0,0.35,1)] group-hover:bg-black/40 group-focus-visible:bg-black/40" />
        {broadcast.kind === 'LIVE' && <LiveStatusBadge status={broadcast.status} />}
        {broadcast.kind === 'RECORDING' && broadcast.durationSeconds !== null && (
          <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {formatDuration(broadcast.durationSeconds)}
          </span>
        )}
      </div>
      <div className="mt-3">
        <BroadcastInfo broadcast={broadcast} />
      </div>
    </Link>
  )
}
