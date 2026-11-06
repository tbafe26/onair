import { createContext, useContext } from 'react'

/** 위젯을 그리는 데 필요한 값. 구매자 정보는 두지 않는다. */
export interface PaymentWidgetRender {
  clientKey: string
  amount: number
  paymentMethodSelector: string
  agreementSelector: string
}

/** 결제 요청에 필요한 값. 결제창이 성공·실패 주소로 이동하면 이 화면은 떠난다. */
export interface PaymentRequest {
  orderId: string
  orderName: string
  successUrl: string
  failUrl: string
}

/** 그려진 위젯. 고른 결제 수단의 테스트 결제창을 연다. */
export interface PaymentWidgetSession {
  requestPayment(request: PaymentRequest): Promise<void>
}

/** 화면이 결제위젯을 얻는 이음매. 결제 SDK는 이 뒤에 둔다. */
export interface PaymentWidget {
  render(options: PaymentWidgetRender): Promise<PaymentWidgetSession>
}

export const PaymentWidgetContext = createContext<PaymentWidget | null>(null)

export function usePaymentWidget(): PaymentWidget {
  const widget = useContext(PaymentWidgetContext)
  if (!widget) throw new Error('PaymentProvider 안에서만 쓸 수 있습니다')
  return widget
}

/** 결제창이 돌아올 주소. 현재 출처로 만들고, 실패 주소에는 우리 주문 번호와 돌아갈 방송 id를 미리 붙인다. */
export function paymentReturnUrls(origin: string, orderId: string, broadcastId: number) {
  const failParams = new URLSearchParams({ orderId, broadcastId: String(broadcastId) })
  return {
    successUrl: `${origin}/donations/success`,
    failUrl: `${origin}/donations/fail?${failParams.toString()}`,
  }
}
