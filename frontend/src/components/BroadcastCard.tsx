import { Link } from 'react-router-dom'
import type { BroadcastSummary } from '../api/broadcasts'
import { BroadcastThumbnail } from './BroadcastThumbnail'
import { BroadcastInfo } from './BroadcastInfo'
import { formatDuration } from '../lib/format'

/**
 * 방송 목록의 썸네일 카드. 누르면 방송 상세 화면으로 간다.
 * 1단계에는 녹화방송뿐이라 종류 배지를 두지 않는다. 라이브방송이 생기면 kind로 배지를 붙인다.
 */
export function BroadcastCard({ broadcast }: { broadcast: BroadcastSummary }) {
  return (
    <Link to={`/broadcasts/${broadcast.id}`} className="group block outline-none">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-card">
        <BroadcastThumbnail url={broadcast.thumbnailUrl} />
        {/* 호버하면 덮개가 0.2초 동안 진해진다. */}
        <div className="absolute inset-0 bg-black/0 transition-colors duration-200 ease-[cubic-bezier(0.65,0,0.35,1)] group-hover:bg-black/40 group-focus-visible:bg-black/40" />
        {broadcast.durationSeconds !== null && (
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
