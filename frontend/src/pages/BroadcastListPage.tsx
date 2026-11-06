import { useInfiniteQuery } from '@tanstack/react-query'
import { Clapperboard, Loader2, Radio } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { broadcastKeys } from '../api/broadcast-keys'
import { fetchBroadcasts, type BroadcastKindFilter } from '../api/broadcasts'
import { BroadcastCard } from '../components/BroadcastCard'
import { BroadcastCardSkeleton } from '../components/BroadcastCardSkeleton'
import { Button } from '../components/ui/button'

// 화면 폭에 따라 1~4열, 간격은 가로 14px, 세로 30px
const gridClass =
  'mt-6 grid grid-cols-1 gap-x-[14px] gap-y-[30px] sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'

const tabs: { kind: BroadcastKindFilter; label: string }[] = [
  { kind: 'LIVE', label: '라이브' },
  { kind: 'RECORDING', label: '녹화방송' },
]

const DEFAULT_KIND: BroadcastKindFilter = 'LIVE'

// 라이브 탭은 방송 상태가 바뀌므로 주기적으로 다시 불러온다. 창에 초점이 돌아오면(기본 동작) 바로 갱신된다.
const LIVE_REFETCH_INTERVAL_MS = 15_000

function parseKind(value: string | null): BroadcastKindFilter {
  return tabs.find((t) => t.kind === value)?.kind ?? DEFAULT_KIND
}

export function BroadcastListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const kind = parseKind(searchParams.get('kind'))
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
    queryKey: broadcastKeys.infinite(kind),
    queryFn: ({ pageParam }) => fetchBroadcasts(pageParam, kind),
    initialPageParam: undefined as number | undefined,
    refetchInterval: kind === 'LIVE' ? LIVE_REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
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
      <div role="tablist" aria-label="방송 종류" className="mt-4 flex gap-6 border-b border-border">
        {tabs.map((t) => {
          const selected = t.kind === kind
          return (
            <button
              key={t.kind}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSearchParams({ kind: t.kind })}
              className={`-mb-px border-b-2 pb-2 text-base font-bold ${
                selected
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-sub hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
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
      {data && items.length === 0 && kind === 'LIVE' && (
        <div className="mt-24 flex flex-col items-center gap-4 text-center">
          <Radio className="size-12 text-sub" aria-hidden="true" />
          <p className="text-base text-sub">라이브 방송이 없습니다</p>
          <Button asChild>
            <Link to="/broadcasts/live/new">라이브 송출</Link>
          </Button>
        </div>
      )}
      {data && items.length === 0 && kind === 'RECORDING' && (
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
