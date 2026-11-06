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
