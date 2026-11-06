// 채팅 WebSocket 프로토콜. 서버 -> 화면 한 방향이고, 채팅 쓰기는 REST로만 한다.
// 문자열은 contracts/chat.json과 같아야 하고, chat-protocol.test.ts가 대조한다.
import type { Comment } from '../api/comments'

export const ChatMessageType = {
  Comment: 'comment',
  Ended: 'ended',
} as const

export type ChatMessage = { type: typeof ChatMessageType.Comment; comment: Comment } | { type: typeof ChatMessageType.Ended }

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

/** 선로에서 읽은 JSON 값을 채팅 메시지로 좁힌다. 모르는 종류이거나 필요한 필드가 없으면 null이다. */
export function parseChatMessage(value: unknown): ChatMessage | null {
  if (typeof value !== 'object' || value === null) return null
  const message = value as Record<string, unknown>
  if (message.type === ChatMessageType.Ended) return { type: ChatMessageType.Ended }
  if (message.type === ChatMessageType.Comment && isComment(message.comment)) {
    return { type: ChatMessageType.Comment, comment: message.comment }
  }
  return null
}
