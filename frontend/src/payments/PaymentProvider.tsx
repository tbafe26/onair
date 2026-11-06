import type { ReactNode } from 'react'
import { PaymentWidgetContext, type PaymentWidget } from './payment-widget'
import { tossPaymentWidget } from './toss-payment-widget'

/** 앱 최상단에 둔다. 값을 주지 않으면 실제 토스 결제위젯을 쓰고, 테스트는 가짜를 넣는다. */
export function PaymentProvider({
  paymentWidget = tossPaymentWidget,
  children,
}: {
  paymentWidget?: PaymentWidget
  children: ReactNode
}) {
  return <PaymentWidgetContext.Provider value={paymentWidget}>{children}</PaymentWidgetContext.Provider>
}
