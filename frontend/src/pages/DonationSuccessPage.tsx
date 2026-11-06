import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { confirmDonation, describeConfirmFailure } from '../api/donations'
import { Button } from '../components/ui/button'
import { donationNoticeState } from '../components/DonationNotice'

/**
 * 결제창이 성공 주소로 돌아오면 쿼리의 paymentKey, orderId, amount로 승인 API를 한 번 부르고,
 * 결과를 알림으로 들고 방송 화면으로 돌아간다. 화면의 성공 표시만으로 후원을 확정하지 않는다. 확정은 서버가 한다.
 */
export function DonationSuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const paymentKey = params.get('paymentKey') ?? ''
  const orderId = params.get('orderId') ?? ''
  const amountText = params.get('amount') ?? ''
  const rawBroadcastId = params.get('broadcastId') ?? ''
  const broadcastId = /^\d+$/.test(rawBroadcastId) ? Number(rawBroadcastId) : null
  const valid = paymentKey !== '' && orderId !== '' && /^\d+$/.test(amountText)

  // 같은 값의 요청은 하나로 합쳐 한 번만 보낸다. 새로고침하면 서버가 확정된 결과를 그대로 돌려준다.
  const confirm = useQuery({
    queryKey: ['donation-confirm', orderId, paymentKey],
    queryFn: () => confirmDonation({ paymentKey, orderId, amount: Number(amountText) }),
    enabled: valid,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const settled = confirm.isSuccess || confirm.isError
  useEffect(() => {
    if (!settled || broadcastId === null) return
    const notice = confirm.isSuccess
      ? donationNoticeState('success', `${confirm.data.amount.toLocaleString('ko-KR')}원을 후원했습니다`)
      : donationNoticeState('error', describeConfirmFailure(confirm.error))
    void navigate(`/broadcasts/${broadcastId}`, { replace: true, state: notice })
  }, [settled, broadcastId, confirm.isSuccess, confirm.data, confirm.error, navigate])

  if (valid && !settled) {
    return (
      <section className="flex flex-col items-start gap-2" aria-busy="true">
        <h1 className="text-[28px] font-extrabold text-foreground">후원을 확인하는 중</h1>
        <p className="text-sub">결제 결과를 확인하고 있습니다. 이 화면을 닫지 마세요</p>
      </section>
    )
  }
  if (valid && broadcastId !== null) return null

  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-[28px] font-extrabold text-foreground">후원을 확인하지 못했습니다</h1>
      <p className="text-sub">{valid ? describeConfirmFailure(confirm.error) : '결제 결과가 올바르지 않습니다'}</p>
      <Button asChild>
        <Link to="/">목록으로 돌아가기</Link>
      </Button>
    </section>
  )
}
