/** 방송 카드와 같은 모양의 자리표시. 첫 목록을 불러오는 동안 보여 준다. */
export function BroadcastCardSkeleton() {
  return (
    <div data-testid="broadcast-card-skeleton" className="animate-pulse">
      <div className="aspect-video rounded-xl bg-card" />
      <div className="mt-3 h-4 w-4/5 rounded bg-card" />
      <div className="mt-2 h-3 w-1/4 rounded bg-card" />
    </div>
  )
}
