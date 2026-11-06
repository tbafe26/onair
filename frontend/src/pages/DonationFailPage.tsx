import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PAYMENT_CANCELED_CODE, recordDonationFailure } from '../api/donations'
import { Button } from '../components/ui/button'
import { donationNoticeState } from '../components/DonationNotice'

/**
 * 결제창이 실패 주소로 돌아오면 쿼리의 orderId, code로 기록 API를 한 번 부르고,
 * 취소·실패 문구를 알림으로 들고 방송 화면으로 돌아간다. 기록이 실패해도 시청자에게는 결과를 알린다.
 */
export function DonationFailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const orderId = params.get('orderId') ?? ''
  const code = params.get('code') ?? ''
  const reason = params.get('message') ?? ''
  const rawBroadcastId = params.get('broadcastId') ?? ''
  const broadcastId = /^\d+$/.test(rawBroadcastId) ? Number(rawBroadcastId) : null
  const valid = orderId !== '' && code !== ''
  const text = code === PAYMENT_CANCELED_CODE ? '후원을 취소했습니다' : failureText(reason)

  const record = useQuery({
    queryKey: ['donation-fail', orderId, code],
    queryFn: () => recordDonationFailure(orderId, code),
    enabled: valid,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const settled = record.isSuccess || record.isError
  useEffect(() => {
    if (!settled || broadcastId === null) return
    void navigate(`/broadcasts/${broadcastId}`, { replace: true, state: donationNoticeState('error', text) })
  }, [settled, broadcastId, text, navigate])

  if (valid && !settled) {
    return (
      <section className="flex flex-col items-start gap-2" aria-busy="true">
        <h1 className="text-[28px] font-extrabold text-foreground">결제 결과를 확인하는 중</h1>
        <p className="text-sub">잠시만 기다려 주세요</p>
      </section>
    )
  }
  if (valid && broadcastId !== null) return null

  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-[28px] font-extrabold text-foreground">결제 결과를 확인하지 못했습니다</h1>
      <p className="text-sub">{valid ? text : '결제 결과가 올바르지 않습니다'}</p>
      <Button asChild>
        <Link to="/">목록으로 돌아가기</Link>
      </Button>
    </section>
  )
}

function failureText(reason: string): string {
  const detail = reason.trim() === '' ? '결제가 완료되지 않았습니다' : reason.trim()
  return `후원하지 못했습니다: ${detail}. 다시 시도해 주세요`
}
