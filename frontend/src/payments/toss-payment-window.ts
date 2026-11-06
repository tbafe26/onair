import type { PaymentWindow } from './payment-window'

/**
 * 토스페이먼츠 SDK v2로 결제창을 연다. SDK는 결제창을 열 때만 불러온다.
 * 공용 테스트 상점이므로 customerKey는 ANONYMOUS이고 구매자 정보는 넘기지 않는다.
 */
export const tossPaymentWindow: PaymentWindow = {
  async open({ clientKey, orderId, amount, orderName, successUrl, failUrl }) {
    const { ANONYMOUS, loadTossPayments } = await import('@tosspayments/tosspayments-sdk')
    const tossPayments = await loadTossPayments(clientKey)
    await tossPayments.payment({ customerKey: ANONYMOUS }).requestPayment({
      method: 'CARD',
      amount: { currency: 'KRW', value: amount },
      orderId,
      orderName,
      successUrl,
      failUrl,
    })
  },
}
