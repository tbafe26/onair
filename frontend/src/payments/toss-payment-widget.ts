import type { PaymentWidget } from './payment-widget'

/**
 * 토스페이먼츠 SDK v2 결제위젯. SDK는 위젯을 그릴 때만 불러온다.
 * 공용 테스트 상점이므로 customerKey는 ANONYMOUS이고 구매자 정보는 넘기지 않는다.
 */
export const tossPaymentWidget: PaymentWidget = {
  async render({ clientKey, amount, paymentMethodSelector, agreementSelector }) {
    const { ANONYMOUS, loadTossPayments } = await import('@tosspayments/tosspayments-sdk')
    const tossPayments = await loadTossPayments(clientKey)
    const widgets = tossPayments.widgets({ customerKey: ANONYMOUS })
    await widgets.setAmount({ currency: 'KRW', value: amount })
    await Promise.all([
      widgets.renderPaymentMethods({ selector: paymentMethodSelector, variantKey: 'DEFAULT' }),
      widgets.renderAgreement({ selector: agreementSelector, variantKey: 'AGREEMENT' }),
    ])
    return {
      requestPayment: ({ orderId, orderName, successUrl, failUrl }) =>
        widgets.requestPayment({ orderId, orderName, successUrl, failUrl }),
    }
  },
}
