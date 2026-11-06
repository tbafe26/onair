import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { DonationDialog } from './DonationDialog'
import { Button } from './ui/button'

/**
 * 방송 중인 라이브방송의 후원 진입점. 로그인한 시청자에게는 버튼을, 방문자에게는 로그인 안내를 보인다.
 * 소유자에게는 아무것도 보이지 않는다. 같은 검사를 서버도 한다.
 */
export function DonationButton({
  broadcastId,
  ownerId,
  ownerNickname,
}: {
  broadcastId: number
  ownerId: number
  ownerNickname: string
}) {
  const { state } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  if (state.status === 'loading') return null
  if (state.status === 'guest') {
    const next = encodeURIComponent(location.pathname + location.search)
    return (
      <p className="mt-3 text-sm text-sub">
        로그인 후 후원할 수 있습니다{' '}
        <Link to={`/login?next=${next}`} className="font-semibold text-foreground underline">
          로그인
        </Link>
      </p>
    )
  }
  if (state.user.id === ownerId) return null

  return (
    <>
      <Button className="mt-3" onClick={() => setOpen(true)}>
        후원
      </Button>
      {open && (
        <DonationDialog broadcastId={broadcastId} recipientNickname={ownerNickname} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
