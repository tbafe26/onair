import { beforeEach, expect, it, vi } from 'vitest'

const requestPayment = vi.fn()
const payment = vi.fn(() => ({ requestPayment }))
const loadTossPayments = vi.fn(() => Promise.resolve({ payment }))

vi.mock('@tosspayments/tosspayments-sdk', () => ({
  ANONYMOUS: '@@ANONYMOUS',
  loadTossPayments,
}))

const { tossPaymentWindow } = await import('./toss-payment-window')

beforeEach(() => {
  vi.clearAllMocks()
  requestPayment.mockResolvedValue(undefined)
})

it('비회원 결제로 카드 결제창을 열고 구매자 정보는 넘기지 않는다', async () => {
  await tossPaymentWindow.open({
    clientKey: 'test_gck_dummy',
    orderId: 'order-1234',
    amount: 5000,
    orderName: '온에어 방송 후원',
    successUrl: 'https://example.test/donations/success',
    failUrl: 'https://example.test/donations/fail?orderId=order-1234&broadcastId=5',
  })

  expect(loadTossPayments).toHaveBeenCalledWith('test_gck_dummy')
  expect(payment).toHaveBeenCalledWith({ customerKey: '@@ANONYMOUS' })
  expect(requestPayment).toHaveBeenCalledWith({
    method: 'CARD',
    amount: { currency: 'KRW', value: 5000 },
    orderId: 'order-1234',
    orderName: '온에어 방송 후원',
    successUrl: 'https://example.test/donations/success',
    failUrl: 'https://example.test/donations/fail?orderId=order-1234&broadcastId=5',
  })
})
