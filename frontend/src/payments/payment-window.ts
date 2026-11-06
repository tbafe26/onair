import { createContext, useContext } from 'react'

/** 결제창을 여는 데 필요한 값. 구매자 정보는 두지 않는다. */
export interface PaymentRequest {
  clientKey: string
  orderId: string
  amount: number
  orderName: string
  successUrl: string
  failUrl: string
}

/** 화면이 결제창을 얻는 이음매. 결제 SDK는 이 뒤에 둔다. 결제창이 성공·실패 주소로 이동하면 이 화면은 떠난다. */
export interface PaymentWindow {
  open(request: PaymentRequest): Promise<void>
}

export const PaymentWindowContext = createContext<PaymentWindow | null>(null)

export function usePaymentWindow(): PaymentWindow {
  const paymentWindow = useContext(PaymentWindowContext)
  if (!paymentWindow) throw new Error('PaymentProvider 안에서만 쓸 수 있습니다')
  return paymentWindow
}

/** 결제창이 돌아올 주소. 현재 출처로 만들고, 실패 주소에는 우리 주문 번호와 돌아갈 방송 id를 미리 붙인다. */
export function paymentReturnUrls(origin: string, orderId: string, broadcastId: number) {
  const failParams = new URLSearchParams({ orderId, broadcastId: String(broadcastId) })
  return {
    successUrl: `${origin}/donations/success`,
    failUrl: `${origin}/donations/fail?${failParams.toString()}`,
  }
}
