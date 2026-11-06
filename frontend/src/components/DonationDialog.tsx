import { useState, type FormEvent } from 'react'
import {
  DONATION_AMOUNT_CHOICES,
  DONATION_AMOUNT_RULE,
  MAX_DONATION_MESSAGE_LENGTH,
  checkDonationAmount,
  createDonationOrder,
  decodeDonationFailure,
  type DonationFailureView,
} from '../api/donations'
import { paymentReturnUrls, usePaymentWindow } from '../payments/payment-window'
import { Modal } from './Modal'
import { TextField } from './TextField'
import { Button } from './ui/button'

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

/** 후원 창: 금액과 메시지를 고르고 받는 사람과 금액을 확인한 뒤 결제창을 연다. */
export function DonationDialog({
  broadcastId,
  recipientNickname,
  onClose,
}: {
  broadcastId: number
  recipientNickname: string
  onClose: () => void
}) {
  const paymentWindow = usePaymentWindow()
  const [amountText, setAmountText] = useState('')
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState<DonationFailureView>({})
  const [submitting, setSubmitting] = useState(false)

  const checked = checkDonationAmount(amountText)
  const confirmedAmount = 'amount' in checked ? checked.amount : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    if (!('amount' in checked)) {
      setFailure({ amount: checked.error })
      return
    }
    setSubmitting(true)
    setFailure({})
    try {
      const order = await createDonationOrder(broadcastId, { amount: checked.amount, message })
      await paymentWindow.open({
        clientKey: order.clientKey,
        orderId: order.orderId,
        amount: order.amount,
        orderName: order.orderName,
        ...paymentReturnUrls(window.location.origin, order.orderId, broadcastId),
      })
    } catch (error) {
      setFailure(decodeDonationFailure(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="후원하기" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} noValidate className="mt-4 flex flex-col gap-4">
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
            maxLength={MAX_DONATION_MESSAGE_LENGTH}
            value={message}
            aria-invalid={failure.message ? true : undefined}
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setMessage(event.target.value)}
          />
          <p className="text-sm text-sub">
            {message.length}/{MAX_DONATION_MESSAGE_LENGTH}자
          </p>
          {failure.message && <p className="text-sm text-destructive">{failure.message}</p>}
        </div>
        <p className="rounded-xl bg-accent p-3 text-foreground" aria-live="polite">
          받는 사람 <strong>{recipientNickname}</strong>
          {confirmedAmount !== null && (
            <>
              {' · '}
              <strong>{won(confirmedAmount)}</strong>
            </>
          )}
        </p>
        {failure.general && (
          <p role="alert" className="text-sm text-destructive">
            {failure.general}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            닫기
          </Button>
          <Button type="submit" disabled={submitting}>
            후원하기
          </Button>
        </div>
      </form>
    </Modal>
  )
}
