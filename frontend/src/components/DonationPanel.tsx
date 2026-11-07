import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  DONATION_AMOUNT_RULE,
  MAX_DONATION_AMOUNT,
  MAX_DONATION_MESSAGE_LENGTH,
  clipDonationMessage,
  donationMessageLength,
  checkDonationAmount,
  createDonationOrder,
  decodeDonationFailure,
  type DonationFailureView,
  type DonationOrder,
} from '../api/donations'
import { useAuth } from '../auth/auth-context'
import { paymentReturnUrls, usePaymentWidget, type PaymentWidgetSession } from '../payments/payment-widget'
import { cn } from '@/lib/utils'
import { useIsMobile } from '../hooks/useMediaQuery'
import { Modal } from './Modal'
import { Button } from './ui/button'

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

const METHODS_ID = 'donation-payment-methods'
const AGREEMENT_ID = 'donation-payment-agreement'
const SAFETY_NOTICE = '테스트 결제입니다. 실제 카드·개인정보를 입력하지 마세요'

const AMOUNT_STEPS = [
  { label: '+1천', amount: 1_000 },
  { label: '+1만', amount: 10_000 },
  { label: '+10만', amount: 100_000 },
] as const

/** 금액 칸의 글자가 숫자만일 때만 현재 금액으로 본다. */
const currentAmount = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : 0)

/**
 * 채팅 패널 아래쪽을 덮고 올라오는 후원 패널의 틀이다. 휴대폰 폭에서는 화면 아래에서 올라오는 시트로 연다.
 * 제목줄은 고정하고 본문만 스크롤한다. closeOnEscape가 true일 때 Esc로 닫는다.
 */
function PanelFrame({
  title,
  closeOnEscape,
  onClose,
  children,
}: {
  title: string
  closeOnEscape: boolean
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const sheet = useIsMobile()

  useEffect(() => {
    if (!closeOnEscape) return
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnKey)
    return () => document.removeEventListener('keydown', closeOnKey)
  }, [closeOnEscape, onClose])

  const panel = (
    <div
      role="dialog"
      aria-modal={sheet}
      aria-labelledby={titleId}
      data-sheet={sheet ? '' : undefined}
      className={cn(
        'flex flex-col bg-card shadow-xl',
        sheet
          ? 'max-h-[85dvh] w-full rounded-t-2xl border-t border-border'
          : 'absolute inset-x-0 bottom-0 z-10 max-h-full rounded-t-2xl border-t border-border',
      )}
    >
      <div className="flex items-center justify-between border-b border-border py-2 pr-2 pl-4">
        <h2 id={titleId} className="text-base font-bold text-foreground">
          {title}
        </h2>
        <Button type="button" variant="ghost" size="icon" aria-label="닫기" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <div data-panel-body className="min-h-0 flex-1 overflow-y-auto p-4">
        {children}
      </div>
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
 * 후원 패널. 닉네임 카드의 메시지와 후원 금액을 정하고 "후원하기"를 누르면 주문을 만든다.
 * 주문이 만들어지면 화면 가운데 모달에 결제위젯을 그리고, 모달의 "결제하기"가 결제창을 연다.
 * 모달을 닫거나 "이전"을 누르면 입력값을 남긴 채 패널로 돌아온다.
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
  const { state: auth } = useAuth()
  const donorNickname = auth.status === 'user' ? auth.user.nickname : ''
  const amountRef = useRef<HTMLInputElement>(null)
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
    amountRef.current?.focus()
  }, [])

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

  async function donate(event: FormEvent) {
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

  function closePayment() {
    // 다시 "후원하기"를 누르면 새 주문으로 위젯을 다시 그린다.
    renderedOrderId.current = null
    setOrder(null)
    setSession(null)
    setFailure({})
  }

  function addAmount(step: number) {
    setAmountText(String(Math.min(currentAmount(amountText) + step, MAX_DONATION_AMOUNT)))
    setFailure((previous) => ({ ...previous, amount: undefined }))
  }

  function clearAmount() {
    setAmountText('')
    amountRef.current?.focus()
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

  return (
    <>
      <PanelFrame title="후원하기" closeOnEscape={!order} onClose={onClose}>
        <form onSubmit={(event) => void donate(event)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl bg-primary p-3 text-primary-foreground">
            <p className="font-bold">{donorNickname}</p>
            <textarea
              aria-label="후원 메시지"
              rows={2}
              value={message}
              placeholder="후원과 함께 채팅을 보내세요"
              aria-invalid={failure.message ? true : undefined}
              className="w-full resize-none rounded-lg bg-background/90 p-2 text-sm text-foreground outline-none placeholder:text-sub focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setMessage(clipDonationMessage(event.target.value))}
            />
            <p className="text-right text-xs">
              {donationMessageLength(message)}/{MAX_DONATION_MESSAGE_LENGTH}
            </p>
          </div>
          {failure.message && <p className="-mt-2 text-sm text-destructive">{failure.message}</p>}

          <div className="flex flex-col gap-2">
            <label htmlFor="donation-amount" className="font-semibold text-title">
              후원 금액
            </label>
            <div className="relative">
              <input
                id="donation-amount"
                ref={amountRef}
                inputMode="numeric"
                autoComplete="off"
                value={amountText}
                aria-invalid={failure.amount ? true : undefined}
                aria-describedby={failure.amount ? 'donation-amount-error' : 'donation-amount-hint'}
                className="h-11 w-full rounded-xl border border-border bg-background pr-11 pl-4 text-foreground outline-none placeholder:text-sub focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setAmountText(event.target.value)}
              />
              {amountText && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="금액 지우기"
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  onClick={clearAmount}
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>
            {failure.amount ? (
              <p id="donation-amount-error" className="text-sm text-destructive">
                {failure.amount}
              </p>
            ) : (
              <p id="donation-amount-hint" className="text-sm text-sub">
                {DONATION_AMOUNT_RULE}
              </p>
            )}
            <div className="flex gap-2">
              {AMOUNT_STEPS.map((step) => (
                <Button
                  key={step.label}
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => addAmount(step.amount)}
                >
                  {step.label}
                </Button>
              ))}
            </div>
          </div>

          {summary}
          {generalError}
          <Button type="submit" className="h-12 w-full text-base" disabled={submitting}>
            후원하기
          </Button>
          <p className="text-center text-xs text-sub">{SAFETY_NOTICE}</p>
        </form>
      </PanelFrame>
      {order && (
        <Modal title="후원 결제" onClose={closePayment}>
          <div className="mt-4 flex flex-col gap-4">
            {summary}
            <p className="text-sm text-sub">{SAFETY_NOTICE}</p>
            <div id={METHODS_ID} />
            <div id={AGREEMENT_ID} />
            {!session && !failure.general && <p className="text-sm text-sub">결제 화면을 불러오는 중...</p>}
            {generalError}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closePayment}>
                이전
              </Button>
              <Button type="button" disabled={!session || submitting} onClick={() => void pay()}>
                결제하기
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
