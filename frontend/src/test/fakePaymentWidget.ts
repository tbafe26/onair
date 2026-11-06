import { vi } from 'vitest'
import type { PaymentWidget, PaymentWidgetSession } from '../payments/payment-widget'

/** 화면 테스트용 결제위젯. 화면이 넘긴 값은 render와 requestPayment의 호출 인자로 확인한다. */
export function createFakePaymentWidget() {
  const session = { requestPayment: vi.fn<PaymentWidgetSession['requestPayment']>(() => Promise.resolve()) }
  const render = vi.fn<PaymentWidget['render']>(() => Promise.resolve(session))
  return { render, session }
}
