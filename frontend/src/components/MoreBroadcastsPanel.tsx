import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { broadcastKeys } from '../api/broadcast-keys'
import { fetchBroadcasts } from '../api/broadcasts'
import { BroadcastInfo } from './BroadcastInfo'
import { BroadcastThumbnail } from './BroadcastThumbnail'

/** 상세 화면 오른쪽의 "방송 더보기" 패널. 목록 API를 그대로 쓰고 현재 방송은 뺀다. */
export function MoreBroadcastsPanel({ currentId }: { currentId: number }) {
  const { data, isPending, isError } = useQuery({
    queryKey: broadcastKeys.list(),
    queryFn: () => fetchBroadcasts(),
  })
  const items = data?.items.filter((broadcast) => broadcast.id !== currentId) ?? []

  return (
    <aside aria-labelledby="more-broadcasts-title" className="w-full">
      <h2 id="more-broadcasts-title" className="text-base font-bold text-foreground">
        방송 더보기
      </h2>
      {isPending && <p className="mt-4 text-sub">불러오는 중...</p>}
      {isError && <p className="mt-4 text-sub">방송 목록을 불러오지 못했습니다.</p>}
      {data && items.length === 0 && <p className="mt-4 text-sub">다른 방송이 없습니다</p>}
      {items.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((broadcast) => (
            <li key={broadcast.id}>
              <Link
                to={`/broadcasts/${broadcast.id}`}
                className="flex gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-card">
                  <BroadcastThumbnail url={broadcast.thumbnailUrl} iconClassName="size-6" />
                </div>
                <div className="min-w-0">
                  <BroadcastInfo broadcast={broadcast} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
