// 채팅 WebSocket 프로토콜. 서버 -> 화면 한 방향이고, 채팅 쓰기는 REST로만 한다.
// 문자열은 contracts/chat.json과 같아야 하고, chat-protocol.test.ts가 대조한다.
import type { Comment } from '../api/comments'
import type { ConfirmedDonation } from '../api/donations'

export const ChatMessageType = {
  Comment: 'comment',
  Donation: 'donation',
  Ended: 'ended',
} as const

/** 채팅으로 온 확정 후원. 후원 내역의 항목에 방송의 새 합계가 붙는다. */
export interface ChatDonation extends ConfirmedDonation {
  total: { amount: number; count: number }
}

export type ChatMessage =
  | { type: typeof ChatMessageType.Comment; comment: Comment }
  | { type: typeof ChatMessageType.Donation; donation: ChatDonation }
  | { type: typeof ChatMessageType.Ended }

function isComment(value: unknown): value is Comment {
  if (typeof value !== 'object' || value === null) return false
  const comment = value as Record<string, unknown>
  const author = comment.author as Record<string, unknown> | null
  return (
    typeof comment.id === 'number' &&
    typeof comment.content === 'string' &&
    typeof comment.createdAt === 'string' &&
    typeof author === 'object' &&
    author !== null &&
    typeof author.id === 'number' &&
    typeof author.nickname === 'string'
  )
}

function isDonation(value: unknown): value is ChatDonation {
  if (typeof value !== 'object' || value === null) return false
  const donation = value as Record<string, unknown>
  const donor = donation.donor as Record<string, unknown> | null
  const total = donation.total as Record<string, unknown> | null
  return (
    typeof donation.id === 'number' &&
    typeof donation.amount === 'number' &&
    (donation.message === null || typeof donation.message === 'string') &&
    typeof donation.confirmedAt === 'string' &&
    typeof donor === 'object' &&
    donor !== null &&
    typeof donor.id === 'number' &&
    typeof donor.nickname === 'string' &&
    typeof total === 'object' &&
    total !== null &&
    typeof total.amount === 'number' &&
    typeof total.count === 'number'
  )
}

/** 선로에서 읽은 JSON 값을 채팅 메시지로 좁힌다. 모르는 종류이거나 필요한 필드가 없으면 null이다. */
export function parseChatMessage(value: unknown): ChatMessage | null {
  if (typeof value !== 'object' || value === null) return null
  const message = value as Record<string, unknown>
  if (message.type === ChatMessageType.Ended) return { type: ChatMessageType.Ended }
  if (message.type === ChatMessageType.Comment && isComment(message.comment)) {
    return { type: ChatMessageType.Comment, comment: message.comment }
  }
  if (message.type === ChatMessageType.Donation && isDonation(message.donation)) {
    return { type: ChatMessageType.Donation, donation: message.donation }
  }
  return null
}
