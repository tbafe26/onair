import axios from 'axios'
import { decodeFailure } from './broadcasts'
import { apiClient } from './client'

/** 서버의 후원 규칙. 서버와 같은 값으로 결제창 전에 미리 검사한다. */
export const MIN_DONATION_AMOUNT = 1_000
export const MAX_DONATION_AMOUNT = 500_000
export const DONATION_AMOUNT_UNIT = 1_000
export const MAX_DONATION_MESSAGE_LENGTH = 100
export const DONATION_AMOUNT_CHOICES = [1_000, 5_000, 10_000, 50_000] as const

export const DONATION_AMOUNT_RULE = '1,000원 이상 500,000원 이하, 1,000원 단위로 입력하세요'

/** 서버가 만든 대기 후원. 화면이 결제창을 여는 데 쓴다. */
export interface DonationOrder {
  orderId: string
  amount: number
  orderName: string
  clientKey: string
}

/** 입력한 금액 문자열을 검사한다. 맞으면 금액을, 아니면 칸에 보일 이유를 돌려준다. */
export function checkDonationAmount(text: string): { amount: number } | { error: string } {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return { error: DONATION_AMOUNT_RULE }
  const amount = Number(trimmed)
  if (amount < MIN_DONATION_AMOUNT || amount > MAX_DONATION_AMOUNT || amount % DONATION_AMOUNT_UNIT !== 0) {
    return { error: DONATION_AMOUNT_RULE }
  }
  return { amount }
}

export async function createDonationOrder(
  broadcastId: number,
  input: { amount: number; message: string },
): Promise<DonationOrder> {
  const message = input.message.trim()
  const response = await apiClient.post<DonationOrder>(`/api/broadcasts/${broadcastId}/donations`, {
    amount: input.amount,
    ...(message === '' ? {} : { message }),
  })
  return response.data
}

/** 승인으로 확정된 후원. */
export interface ConfirmedDonation {
  id: number
  amount: number
  message: string | null
  donor: { id: number; nickname: string }
  confirmedAt: string
}

/** 방송의 후원 내역 한 묶음(최신순)과 방송 전체의 확정 합계. nextCursor가 있으면 그 값을 cursor로 넘겨 이어 받는다. */
export interface DonationPage {
  total: { amount: number; count: number }
  items: ConfirmedDonation[]
  nextCursor: string | null
}

export const donationKeys = {
  list: (broadcastId: number) => ['donations', broadcastId] as const,
}

export async function fetchDonations(broadcastId: number, cursor?: string): Promise<DonationPage> {
  const response = await apiClient.get<DonationPage>(`/api/broadcasts/${broadcastId}/donations`, {
    params: { cursor },
  })
  return response.data
}

/** 결제창이 돌려준 값으로 서버에 승인을 요청한다. 같은 요청을 반복해도 확정된 결과가 그대로 온다. */
export async function confirmDonation(input: {
  paymentKey: string
  orderId: string
  amount: number
}): Promise<ConfirmedDonation> {
  const response = await apiClient.post<ConfirmedDonation>('/api/donations/confirm', input)
  return response.data
}

/** 사용자가 결제창을 닫았을 때 토스가 실패 주소로 넘기는 코드. */
export const PAYMENT_CANCELED_CODE = 'PAY_PROCESS_CANCELED'

/** 결제창이 실패·취소로 돌아왔음을 서버에 알린다. 대기 후원만 바뀌고 이미 정해진 주문은 그대로다. */
export async function recordDonationFailure(orderId: string, code: string): Promise<{ status: string }> {
  const response = await apiClient.post<{ status: string }>(`/api/donations/${encodeURIComponent(orderId)}/fail`, {
    code,
  })
  return response.data
}

/** 승인 실패를 사용자에게 보일 문장으로 바꾼다. 서버가 상태 코드로 이유를 구분한다. */
export function describeConfirmFailure(error: unknown): string {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  switch (status) {
    case 400:
      return '결제 금액이 주문과 달라 후원하지 못했습니다'
    case 402:
      return '결제가 승인되지 않아 후원하지 못했습니다'
    case 403:
    case 404:
      return '후원 주문을 찾을 수 없습니다'
    case 409:
      return '이미 실패했거나 취소된 후원입니다'
    default:
      return '후원을 확인하지 못했습니다. 잠시 뒤 다시 시도하세요'
  }
}

export interface DonationFailureView {
  amount?: string
  message?: string
  /** 칸에 붙일 수 없는 오류 */
  general?: string
}

/** 후원 주문 실패를 사용자에게 보일 문장으로 바꾼다. */
export function decodeDonationFailure(error: unknown): DonationFailureView {
  if (axios.isAxiosError(error) && error.response?.status === 503) {
    return { general: '지금은 후원을 사용할 수 없습니다. 서버의 결제 설정을 확인하세요' }
  }
  const failure = decodeFailure(error)
  switch (failure.kind) {
    case 'invalid':
      return { amount: failure.fieldErrors.amount, message: failure.fieldErrors.message }
    case 'unauthorized':
      return { general: '로그인이 필요합니다' }
    case 'forbidden':
      return { general: '자신의 방송에는 후원할 수 없습니다' }
    case 'notFound':
      return { general: '방송을 찾을 수 없습니다' }
    case 'conflict':
      return { general: '방송 중인 라이브방송에만 후원할 수 있습니다' }
    default:
      return { general: '후원을 시작하지 못했습니다. 잠시 뒤 다시 시도하세요' }
  }
}
