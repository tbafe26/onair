import { useInfiniteQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { broadcastKeys } from '../api/broadcast-keys'
import { fetchMyBroadcasts, type BroadcastSummary } from '../api/broadcasts'
import { BroadcastOwnerActions } from '../components/BroadcastOwnerActions'
import { BroadcastThumbnail } from '../components/BroadcastThumbnail'
import { Button } from '../components/ui/button'
import { formatDateTime } from '../lib/format'

function statusText(broadcast: BroadcastSummary): string {
  if (broadcast.kind === 'RECORDING') return '-'
  return broadcast.status === 'ON_AIR' ? '방송 중' : '종료'
}

/** 내가 올리거나 송출한 방송을 최신순으로 보여 주고 제목 수정·삭제를 맡긴다. 로그인 확인은 라우트가 한다. */
export function MyBroadcastsPage() {
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } =
    useInfiniteQuery({
      queryKey: broadcastKeys.mine(),
      queryFn: ({ pageParam }) => fetchMyBroadcasts(pageParam),
      initialPageParam: undefined as number | undefined,
      getNextPageParam: (lastPage) =>
        lastPage.hasNext ? lastPage.items[lastPage.items.length - 1]?.id : undefined,
    })

  // 목록 끝 표지가 보이면 다음 묶음을 부른다. 더 없거나, 불러오는 중이거나, 실패한 뒤에는 감시하지 않는다.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const watching = hasNextPage && !isFetchingNextPage && !isFetchNextPageError
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!watching || !sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage()
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [watching, fetchNextPage])

  const items = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section>
      <h1 className="text-[28px] font-extrabold text-foreground">내 방송</h1>
      {isPending && <p className="mt-6 text-sub">불러오는 중...</p>}
      {isError && !data && (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="text-sub">내 방송을 불러오지 못했습니다.</p>
          <Button onClick={() => void refetch()}>다시 시도</Button>
        </div>
      )}
      {data && items.length === 0 && (
        <p className="mt-24 text-center text-base text-sub">아직 올린 방송이 없습니다</p>
      )}
      {items.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-border text-sm text-sub">
                <th scope="col" className="w-36 py-2 pr-4 font-semibold">
                  <span className="sr-only">썸네일</span>
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  제목
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  종류
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  상태
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  등록일
                </th>
                <th scope="col" className="py-2 font-semibold">
                  <span className="sr-only">관리</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((broadcast) => (
                <tr key={broadcast.id} className="border-b border-border align-middle">
                  <td className="py-3 pr-4">
                    <div className="aspect-video w-32 overflow-hidden rounded-lg bg-card">
                      <BroadcastThumbnail url={broadcast.thumbnailUrl} iconClassName="size-6" />
                    </div>
                  </td>
                  <td className="max-w-80 py-3 pr-4">
                    <Link
                      to={`/broadcasts/${broadcast.id}`}
                      className="line-clamp-2 font-semibold break-words text-title hover:underline"
                    >
                      {broadcast.title}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {broadcast.kind === 'LIVE' ? '라이브' : '녹화방송'}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">{statusText(broadcast)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap text-sub">
                    <time dateTime={broadcast.createdAt}>{formatDateTime(broadcast.createdAt)}</time>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <BroadcastOwnerActions
                        broadcast={broadcast}
                        onAir={broadcast.kind === 'LIVE' && broadcast.status === 'ON_AIR'}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {watching && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
      {isFetchingNextPage && (
        <div role="status" aria-label="다음 방송을 불러오는 중" className="flex justify-center py-8 text-sub">
          <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        </div>
      )}
      {isFetchNextPageError && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sub">다음 방송을 불러오지 못했습니다.</p>
          <Button onClick={() => void fetchNextPage()}>다시 시도</Button>
        </div>
      )}
    </section>
  )
}
