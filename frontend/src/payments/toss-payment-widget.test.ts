import { beforeEach, expect, it, vi } from 'vitest'

const requestPayment = vi.fn()
const setAmount = vi.fn()
const renderPaymentMethods = vi.fn()
const renderAgreement = vi.fn()
const widgets = vi.fn(() => ({ setAmount, renderPaymentMethods, renderAgreement, requestPayment }))
const loadTossPayments = vi.fn(() => Promise.resolve({ widgets }))

vi.mock('@tosspayments/tosspayments-sdk', () => ({
  ANONYMOUS: '@@ANONYMOUS',
  loadTossPayments,
}))

const { tossPaymentWidget } = await import('./toss-payment-widget')

beforeEach(() => {
  vi.clearAllMocks()
  requestPayment.mockResolvedValue(undefined)
})

it('비회원으로 금액을 정하고 결제 수단과 약관을 그린 뒤, 결제 요청에는 구매자 정보를 넘기지 않는다', async () => {
  const session = await tossPaymentWidget.render({
    clientKey: 'test_gck_dummy',
    amount: 5000,
    paymentMethodSelector: '#methods',
    agreementSelector: '#agreement',
  })

  expect(loadTossPayments).toHaveBeenCalledWith('test_gck_dummy')
  expect(widgets).toHaveBeenCalledWith({ customerKey: '@@ANONYMOUS' })
  expect(setAmount).toHaveBeenCalledWith({ currency: 'KRW', value: 5000 })
  expect(renderPaymentMethods).toHaveBeenCalledWith({ selector: '#methods', variantKey: 'DEFAULT' })
  expect(renderAgreement).toHaveBeenCalledWith({ selector: '#agreement', variantKey: 'AGREEMENT' })
  expect(requestPayment).not.toHaveBeenCalled()

  await session.requestPayment({
    orderId: 'order-1234',
    orderName: '온에어 방송 후원',
    successUrl: 'https://example.test/donations/success',
    failUrl: 'https://example.test/donations/fail?orderId=order-1234&broadcastId=5',
  })

  expect(requestPayment).toHaveBeenCalledWith({
    orderId: 'order-1234',
    orderName: '온에어 방송 후원',
    successUrl: 'https://example.test/donations/success',
    failUrl: 'https://example.test/donations/fail?orderId=order-1234&broadcastId=5',
  })
})
