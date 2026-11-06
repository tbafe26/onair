import type { ReactNode } from 'react'
import { PaymentWindowContext, type PaymentWindow } from './payment-window'
import { tossPaymentWindow } from './toss-payment-window'

/** 앱 최상단에 둔다. 값을 주지 않으면 실제 토스 결제창을 쓰고, 테스트는 가짜를 넣는다. */
export function PaymentProvider({
  paymentWindow = tossPaymentWindow,
  children,
}: {
  paymentWindow?: PaymentWindow
  children: ReactNode
}) {
  return <PaymentWindowContext.Provider value={paymentWindow}>{children}</PaymentWindowContext.Provider>
}
