import { useInfiniteQuery } from '@tanstack/react-query'
import { Clapperboard, Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { broadcastKeys } from '../api/broadcast-keys'
import { fetchBroadcasts } from '../api/broadcasts'
import { BroadcastCard } from '../components/BroadcastCard'
import { BroadcastCardSkeleton } from '../components/BroadcastCardSkeleton'
import { Button } from '../components/ui/button'

// 화면 폭에 따라 1~4열, 간격은 가로 14px, 세로 30px
const gridClass =
  'mt-6 grid grid-cols-1 gap-x-[14px] gap-y-[30px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'

export function BroadcastListPage() {
  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: broadcastKeys.infinite(),
    queryFn: ({ pageParam }) => fetchBroadcasts(pageParam),
    initialPageParam: undefined as number | undefined,
    // 마지막 묶음의 마지막 id보다 오래된 방송을 이어 받는다. 더 없으면 undefined다.
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
      <h1 className="text-[28px] font-extrabold text-foreground">전체 방송</h1>
      {isPending && (
        <ul aria-label="방송 목록을 불러오는 중" className={gridClass}>
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <BroadcastCardSkeleton />
            </li>
          ))}
        </ul>
      )}
      {isError && !data && (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="text-sub">방송 목록을 불러오지 못했습니다.</p>
          <Button onClick={() => void refetch()}>다시 시도</Button>
        </div>
      )}
      {data && items.length === 0 && (
        <div className="mt-24 flex flex-col items-center gap-4 text-center">
          <Clapperboard className="size-12 text-sub" aria-hidden="true" />
          <p className="text-base text-sub">등록된 방송이 없습니다</p>
          <Button asChild>
            <Link to="/broadcasts/new">방송 등록</Link>
          </Button>
        </div>
      )}
      {items.length > 0 && (
        <ul className={gridClass}>
          {items.map((broadcast) => (
            <li key={broadcast.id}>
              <BroadcastCard broadcast={broadcast} />
            </li>
          ))}
        </ul>
      )}
      {watching && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
      {isFetchingNextPage && (
        <div
          role="status"
          aria-label="다음 방송을 불러오는 중"
          className="flex justify-center py-8 text-sub"
        >
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
