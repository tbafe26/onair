import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from './ui/button'

interface DonationNoticeData {
  kind: 'success' | 'error'
  text: string
}

/** 결제 결과 화면이 방송 화면으로 돌아가며 넘기는 알림. 화면 이동의 state에 싣는다. */
export function donationNoticeState(kind: DonationNoticeData['kind'], text: string) {
  return { donationNotice: { kind, text } satisfies DonationNoticeData }
}

function readNotice(state: unknown): DonationNoticeData | null {
  if (typeof state !== 'object' || state === null || !('donationNotice' in state)) return null
  const notice = (state as { donationNotice: Partial<DonationNoticeData> }).donationNotice
  if ((notice.kind === 'success' || notice.kind === 'error') && typeof notice.text === 'string') {
    return { kind: notice.kind, text: notice.text }
  }
  return null
}

/**
 * 후원 결과 알림. 한 번 보여 준 뒤 이동 기록에서 지워, 새로고침해도 같은 알림이 되살아나지 않게 한다.
 * 닫기 버튼으로 숨길 수 있다.
 */
export function DonationNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const [notice, setNotice] = useState<DonationNoticeData | null>(() => readNotice(location.state))

  useEffect(() => {
    if (readNotice(location.state)) {
      void navigate(location.pathname + location.search, { replace: true, state: null })
    }
  }, [location.state, location.pathname, location.search, navigate])

  if (!notice) return null
  const error = notice.kind === 'error'
  return (
    <div
      role={error ? 'alert' : 'status'}
      aria-label="후원 결과"
      className={`mt-4 flex items-center justify-between gap-3 rounded-xl p-3 ${
        error ? 'bg-destructive/10 text-destructive' : 'bg-accent text-foreground'
      }`}
    >
      <p className="font-semibold">{notice.text}</p>
      <Button type="button" variant="outline" onClick={() => setNotice(null)}>
        닫기
      </Button>
    </div>
  )
}
