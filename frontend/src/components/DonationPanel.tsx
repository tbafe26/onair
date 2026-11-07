import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
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
import { cn } from '@/lib/utils'
import { useIsMobile } from '../hooks/useMediaQuery'
import { TextField } from './TextField'
import { Button } from './ui/button'

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

const METHODS_ID = 'donation-payment-methods'
const AGREEMENT_ID = 'donation-payment-agreement'

/**
 * 채팅 패널 위에 겹쳐 열리는 후원 패널의 틀이다. 휴대폰 폭에서는 화면 아래에서 올라오는 시트로 연다.
 * 제목과 버튼 줄은 고정하고 본문(결제위젯 포함)만 스크롤한다. Esc로 닫는다.
 */
function PanelFrame({
  title,
  footer,
  onClose,
  children,
}: {
  title: string
  footer: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const sheet = useIsMobile()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const panel = (
    <div
      role="dialog"
      aria-modal={sheet}
      aria-labelledby={titleId}
      data-sheet={sheet ? '' : undefined}
      className={cn(
        'flex flex-col bg-card',
        sheet ? 'max-h-[85dvh] w-full rounded-t-2xl border-t border-border shadow-xl' : 'absolute inset-0 z-10',
      )}
    >
      <h2 id={titleId} className="border-b border-border px-4 py-3 text-base font-bold text-foreground">
        {title}
      </h2>
      <div data-panel-body className="min-h-0 flex-1 overflow-y-auto p-4">
        {children}
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-3">{footer}</div>
    </div>
  )
  if (!sheet) return panel
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {panel}
    </div>
  )
}

/**
 * 후원 패널. 1단계에서 금액과 메시지를 고르고 받는 사람과 금액을 확인한다.
 * "다음"을 누르면 주문을 만들고 결제위젯을 그리며, 2단계의 "후원하기"가 결제창을 연다.
 */
export function DonationPanel({
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
      <PanelFrame
        title="후원하기"
        onClose={onClose}
        footer={
          <>
            <Button type="button" variant="outline" onClick={back}>
              이전
            </Button>
            <Button type="button" disabled={!session || submitting} onClick={() => void pay()}>
              후원하기
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {summary}
          <p className="text-sm text-sub">테스트 결제입니다. 실제 카드·개인정보를 입력하지 마세요</p>
          <div id={METHODS_ID} />
          <div id={AGREEMENT_ID} />
          {!session && !failure.general && <p className="text-sm text-sub">결제 화면을 불러오는 중...</p>}
          {generalError}
        </div>
      </PanelFrame>
    )
  }

  return (
    <PanelFrame
      title="후원하기"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            닫기
          </Button>
          <Button type="submit" form="donation-form" disabled={submitting}>
            다음
          </Button>
        </>
      }
    >
      <form id="donation-form" onSubmit={(event) => void next(event)} noValidate className="flex flex-col gap-4">
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
          autoFocus
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
      </form>
    </PanelFrame>
  )
}
