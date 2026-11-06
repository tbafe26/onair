import { describe, expect, it } from 'vitest'
import contract from '../../../contracts/chat.json'
import { ChatMessageType, parseChatMessage } from './chat-protocol'

const COMMENT = {
  id: 3,
  content: '안녕',
  author: { id: 1, nickname: '방송러' },
  createdAt: '2026-03-15T12:00:00Z',
}

describe('계약 파일 대조', () => {
  it('메시지 종류가 contracts/chat.json과 같다', () => {
    expect(Object.values(ChatMessageType).sort()).toEqual(Object.keys(contract.messages).sort())
  })

  it('계약대로 만든 comment 메시지를 읽는다(필드 이름이 계약과 같다)', () => {
    const comment = Object.fromEntries(
      contract.commentFields.map((field) => [field, field === 'author' ? Object.fromEntries(contract.authorFields.map((f) => [f, f === 'id' ? 1 : '이름'])) : field === 'id' ? 3 : '값']),
    )

    expect(parseChatMessage({ type: 'comment', comment })).toEqual({ type: 'comment', comment })
    expect(contract.messages.comment['server->client']).toEqual(['comment'])
  })

  it('계약대로 만든 ended 메시지를 읽는다', () => {
    expect(contract.messages.ended['server->client']).toEqual([])
    expect(parseChatMessage({ type: 'ended' })).toEqual({ type: 'ended' })
  })
})

describe('parseChatMessage', () => {
  it('comment와 ended를 읽는다', () => {
    expect(parseChatMessage({ type: 'comment', comment: COMMENT })).toEqual({ type: 'comment', comment: COMMENT })
    expect(parseChatMessage({ type: 'ended' })).toEqual({ type: 'ended' })
  })

  it('모르는 종류와 필드가 빠진 메시지는 null이다', () => {
    expect(parseChatMessage({ type: 'unknown' })).toBeNull()
    expect(parseChatMessage({ type: 'comment' })).toBeNull()
    expect(parseChatMessage({ type: 'comment', comment: { ...COMMENT, author: null } })).toBeNull()
    expect(parseChatMessage({ type: 'comment', comment: { ...COMMENT, id: '3' } })).toBeNull()
    expect(parseChatMessage(null)).toBeNull()
    expect(parseChatMessage('ended')).toBeNull()
  })
})
