import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  DONATION_AMOUNT_CHOICES,
  DONATION_AMOUNT_RULE,
  MAX_DONATION_MESSAGE_LENGTH,
  clipDonationMessage,
  donationMessageLength,
  checkDonationAmount,
  createDonationOrder,
  decodeDonationFailure,
  type DonationFailureView,
  type DonationOrder,
} from '../api/donations'
import { paymentReturnUrls, usePaymentWidget, type PaymentWidgetSession } from '../payments/payment-widget'
import { Modal } from './Modal'
import { TextField } from './TextField'
import { Button } from './ui/button'

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

const METHODS_ID = 'donation-payment-methods'
const AGREEMENT_ID = 'donation-payment-agreement'

/**
 * 후원 창. 1단계에서 금액과 메시지를 고르고 받는 사람과 금액을 확인한다.
 * "다음"을 누르면 주문을 만들고 결제위젯을 그리며, 2단계의 "후원하기"가 결제창을 연다.
 */
export function DonationDialog({
  broadcastId,
  recipientNickname,
  onClose,
}: {
  broadcastId: number
  recipientNickname: string
  onClose: () => void
}) {
  const widget = usePaymentWidget()
  const [amountText, setAmountText] = useState('')
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState<DonationFailureView>({})
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState<DonationOrder | null>(null)
  const [session, setSession] = useState<PaymentWidgetSession | null>(null)
  const renderedOrderId = useRef<string | null>(null)

  const checked = checkDonationAmount(amountText)
  const confirmedAmount = 'amount' in checked ? checked.amount : null

  useEffect(() => {
    if (!order || renderedOrderId.current === order.orderId) return
    renderedOrderId.current = order.orderId
    widget
      .render({
        clientKey: order.clientKey,
        amount: order.amount,
        paymentMethodSelector: `#${METHODS_ID}`,
        agreementSelector: `#${AGREEMENT_ID}`,
      })
      .then(setSession)
      .catch(() => setFailure({ general: '결제 화면을 불러오지 못했습니다. 잠시 뒤 다시 시도하세요' }))
  }, [order, widget])

  async function next(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    if (!('amount' in checked)) {
      setFailure({ amount: checked.error })
      return
    }
    setSubmitting(true)
    setFailure({})
    try {
      setOrder(await createDonationOrder(broadcastId, { amount: checked.amount, message }))
    } catch (error) {
      setFailure(decodeDonationFailure(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function pay() {
    if (!order || !session || submitting) return
    setSubmitting(true)
    setFailure({})
    try {
      await session.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        ...paymentReturnUrls(window.location.origin, order.orderId, broadcastId),
      })
    } catch {
      setFailure({ general: '결제창을 열지 못했습니다. 잠시 뒤 다시 시도하세요' })
    } finally {
      setSubmitting(false)
    }
  }

  function back() {
    // 금액이 바뀔 수 있으므로 다음에 새 주문으로 위젯을 다시 그린다.
    renderedOrderId.current = null
    setOrder(null)
    setSession(null)
    setFailure({})
  }

  const summary = (
    <p className="rounded-xl bg-accent p-3 text-foreground" aria-live="polite">
      받는 사람 <strong>{recipientNickname}</strong>
      {confirmedAmount !== null && (
        <>
          {' · '}
          <strong>{won(confirmedAmount)}</strong>
        </>
      )}
    </p>
  )
  const generalError = failure.general && (
    <p role="alert" className="text-sm text-destructive">
      {failure.general}
    </p>
  )

  if (order) {
    return (
      <Modal title="후원하기" onClose={onClose}>
        <div className="mt-4 flex flex-col gap-4">
          {summary}
          <p className="text-sm text-sub">테스트 결제입니다. 실제 카드·개인정보를 입력하지 마세요</p>
          <div id={METHODS_ID} />
          <div id={AGREEMENT_ID} />
          {!session && !failure.general && <p className="text-sm text-sub">결제 화면을 불러오는 중...</p>}
          {generalError}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={back}>
              이전
            </Button>
            <Button type="button" disabled={!session || submitting} onClick={() => void pay()}>
              후원하기
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="후원하기" onClose={onClose}>
      <form onSubmit={(event) => void next(event)} noValidate className="mt-4 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="금액 선택">
          {DONATION_AMOUNT_CHOICES.map((choice) => (
            <Button
              key={choice}
              type="button"
              variant={confirmedAmount === choice ? 'default' : 'outline'}
              aria-pressed={confirmedAmount === choice}
              onClick={() => setAmountText(String(choice))}
            >
              {won(choice)}
            </Button>
          ))}
        </div>
        <TextField
          id="donation-amount"
          label="금액(원)"
          inputMode="numeric"
          autoComplete="off"
          value={amountText}
          hint={DONATION_AMOUNT_RULE}
          error={failure.amount}
          onChange={(event) => setAmountText(event.target.value)}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="donation-message" className="font-semibold text-title">
            메시지(선택)
          </label>
          <textarea
            id="donation-message"
            rows={3}
            value={message}
            aria-invalid={failure.message ? true : undefined}
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setMessage(clipDonationMessage(event.target.value))}
          />
          <p className="text-sm text-sub">
            {donationMessageLength(message)}/{MAX_DONATION_MESSAGE_LENGTH}자
          </p>
          {failure.message && <p className="text-sm text-destructive">{failure.message}</p>}
        </div>
        {summary}
        {generalError}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            닫기
          </Button>
          <Button type="submit" disabled={submitting}>
            다음
          </Button>
        </div>
      </form>
    </Modal>
  )
}
