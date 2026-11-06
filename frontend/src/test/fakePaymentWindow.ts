import { vi } from 'vitest'
import type { PaymentWindow } from '../payments/payment-window'

/** 화면 테스트용 결제창. 화면이 넘긴 값은 open의 호출 인자로 확인한다. */
export function createFakePaymentWindow() {
  return { open: vi.fn<PaymentWindow['open']>(() => Promise.resolve()) }
}
