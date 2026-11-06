import { describe, expect, it } from 'vitest'
import contract from '../../../contracts/chat.json'
import { MAX_COMMENT_LENGTH } from '../api/comments'
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

  it('계약대로 만든 donation 메시지를 읽는다(필드 이름이 계약과 같다)', () => {
    const named = (fields: string[], values: Record<string, unknown>) => Object.fromEntries(fields.map((field) => [field, values[field]]))
    const donation = named(contract.donationFields, {
      id: 12,
      amount: 5000,
      message: '힘내세요',
      donor: named(contract.donorFields, { id: 3, nickname: '후원자' }),
      confirmedAt: '2026-03-15T12:30:00Z',
      total: named(contract.totalFields, { amount: 15000, count: 3 }),
    })

    expect(contract.messages.donation['server->client']).toEqual(['donation'])
    expect(parseChatMessage({ type: 'donation', donation })).toEqual({ type: 'donation', donation })
  })

  it('댓글 길이 상한이 계약과 같다', () => {
    expect(MAX_COMMENT_LENGTH).toBe(contract.commentMaxLength)
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

  it('메시지 없는 후원도 읽고, 필드가 빠졌거나 모양이 다르면 null이다', () => {
    const donation = {
      id: 12,
      amount: 5000,
      message: null,
      donor: { id: 3, nickname: '후원자' },
      confirmedAt: '2026-03-15T12:30:00Z',
      total: { amount: 5000, count: 1 },
    }

    expect(parseChatMessage({ type: 'donation', donation })).toEqual({ type: 'donation', donation })
    expect(parseChatMessage({ type: 'donation' })).toBeNull()
    expect(parseChatMessage({ type: 'donation', donation: { ...donation, total: undefined } })).toBeNull()
    expect(parseChatMessage({ type: 'donation', donation: { ...donation, donor: null } })).toBeNull()
    expect(parseChatMessage({ type: 'donation', donation: { ...donation, amount: '5000' } })).toBeNull()
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
