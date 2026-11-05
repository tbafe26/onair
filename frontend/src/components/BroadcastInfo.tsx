import type { BroadcastSummary } from '../api/broadcasts'
import { formatMonthDay } from '../lib/format'

/** 방송 제목과 날짜. 목록 카드와 "방송 더보기" 패널이 함께 쓴다. */
export function BroadcastInfo({ broadcast }: { broadcast: BroadcastSummary }) {
  return (
    <>
      <p className="line-clamp-2 text-sm font-semibold break-words text-title">
        {broadcast.title}
      </p>
      <p className="mt-1 text-xs text-sub">{formatMonthDay(broadcast.createdAt)}</p>
    </>
  )
}
