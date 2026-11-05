import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 방송 썸네일. 주소가 없으면 카드 바탕색 위에 재생 아이콘 자리표시를 보여 준다. */
export function BroadcastThumbnail({
  url,
  iconClassName = 'size-10',
}: {
  url: string | null
  iconClassName?: string
}) {
  if (url) {
    return <img src={url} alt="" loading="lazy" className="size-full object-cover" />
  }
  return (
    <div
      role="img"
      aria-label="썸네일 없음"
      className="flex size-full items-center justify-center text-sub"
    >
      <Play className={cn(iconClassName)} aria-hidden="true" />
    </div>
  )
}
