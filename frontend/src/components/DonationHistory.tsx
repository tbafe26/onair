import { useInfiniteQuery } from '@tanstack/react-query'
import { donationKeys, fetchDonations } from '../api/donations'
import { formatDateTime } from '../lib/format'
import { Button } from './ui/button'

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

/**
 * 라이브방송의 후원 영역. 확정된 후원의 합계와 건수, 최신순 내역을 보이고 길면 이어 불러온다.
 * 내역은 ['donations', 방송 id] 조회 캐시 한 곳에 두므로, 실시간 후원은 그 캐시의 첫 묶음 앞에 붙이고 합계를 바꾸면 된다.
 * 내용은 React의 기본 이스케이프로 글자 그대로 보여 준다.
 */
export function DonationHistory({ broadcastId, className }: { broadcastId: number; className?: string }) {
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: donationKeys.list(broadcastId),
    queryFn: ({ pageParam }) => fetchDonations(broadcastId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
  const donations = data?.pages.flatMap((page) => page.items) ?? []
  const total = data?.pages[data.pages.length - 1]?.total

  return (
    <section aria-labelledby={`donations-title-${broadcastId}`} className={className}>
      <h2 id={`donations-title-${broadcastId}`} className="text-lg font-bold text-foreground">
        후원
      </h2>
      {total && (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sub">
          <span className="text-lg font-bold text-foreground">{won(total.amount)}</span>
          <span>{total.count}건</span>
        </p>
      )}
      {isPending && <p className="mt-3 text-sub">불러오는 중...</p>}
      {isError && !data && (
        <div className="mt-3 flex flex-col items-start gap-3">
          <p className="text-sub">후원 내역을 불러오지 못했습니다.</p>
          <Button onClick={() => void refetch()}>다시 시도</Button>
        </div>
      )}
      {data && donations.length === 0 && <p className="mt-3 text-sub">아직 후원이 없습니다</p>}
      {donations.length > 0 && (
        <ul aria-label="후원 내역" className="mt-3 flex flex-col gap-3">
          {donations.map((donation) => (
            <li key={donation.id} className="min-w-0 break-words rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold text-foreground">{donation.donor.nickname}</span>
                <span className="font-bold text-foreground">{won(donation.amount)}</span>
              </div>
              {donation.message && <p className="mt-1 whitespace-pre-wrap text-foreground">{donation.message}</p>}
              <time dateTime={donation.confirmedAt} className="mt-1 block text-xs text-sub">
                {formatDateTime(donation.confirmedAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
      {hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          후원 더 보기
        </Button>
      )}
    </section>
  )
}
