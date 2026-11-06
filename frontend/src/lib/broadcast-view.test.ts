import { describe, expect, it } from 'vitest'
import type { AuthState } from '../auth/auth-context'
import { canDeleteComment, manageFailureMessage, viewBroadcast } from './broadcast-view'

const owner = { id: 1, nickname: '주인' }
const recording = { id: 10, kind: 'RECORDING' as const, owner }
const onAirLive = { id: 11, kind: 'LIVE' as const, owner, status: 'ON_AIR' as const }
const endedLive = { id: 12, kind: 'LIVE' as const, owner, status: 'ENDED' as const }

const anonymous: AuthState = { status: 'guest' }
const loading: AuthState = { status: 'loading' }
const ownerAuth = { status: 'user', user: { id: 1, nickname: '주인' } } as AuthState
const otherAuth = { status: 'user', user: { id: 2, nickname: '타인' } } as AuthState

const none = { rename: false, remove: false, end: false, comment: false }

describe('viewBroadcast', () => {
  const rows = [
    ['녹화 / 비로그인', recording, anonymous, '-', false, false, none],
    ['녹화 / 확인 중', recording, loading, '-', false, false, none],
    ['녹화 / 소유자', recording, ownerAuth, '-', false, true, { rename: true, remove: true, end: false, comment: true }],
    ['녹화 / 다른 사용자', recording, otherAuth, '-', false, false, { ...none, comment: true }],
    ['방송 중 / 비로그인', onAirLive, anonymous, '방송 중', true, false, none],
    ['방송 중 / 소유자', onAirLive, ownerAuth, '방송 중', true, true, { rename: true, remove: true, end: true, comment: false }],
    ['방송 중 / 다른 사용자', onAirLive, otherAuth, '방송 중', true, false, none],
    ['종료 / 비로그인', endedLive, anonymous, '종료', false, false, none],
    ['종료 / 소유자', endedLive, ownerAuth, '종료', false, true, { rename: true, remove: true, end: false, comment: false }],
    ['종료 / 다른 사용자', endedLive, otherAuth, '종료', false, false, none],
  ] as const

  it.each(rows)('%s', (_name, broadcast, auth, statusLabel, onAir, isOwner, actions) => {
    expect(viewBroadcast(broadcast, auth)).toEqual({ statusLabel, onAir, isOwner, actions })
  })
})

describe('canDeleteComment', () => {
  it('내 댓글에만 허용한다', () => {
    expect(canDeleteComment(ownerAuth, 1)).toBe(true)
    expect(canDeleteComment(otherAuth, 1)).toBe(false)
    expect(canDeleteComment(anonymous, 1)).toBe(false)
    expect(canDeleteComment(loading, 1)).toBe(false)
  })
})

describe('manageFailureMessage', () => {
  const conflict = { kind: 'conflict', message: '방송 중에는 지울 수 없습니다' } as const
  it.each([
    ['rename', { kind: 'forbidden' }, '소유자만 제목을 고칠 수 있습니다'],
    ['rename', { kind: 'notFound' }, '방송을 찾을 수 없습니다'],
    ['rename', { kind: 'unauthorized' }, '제목을 고치지 못했습니다. 잠시 뒤 다시 시도하세요'],
    ['rename', { kind: 'invalid', fieldErrors: { title: '너무 깁니다' } }, '너무 깁니다'],
    ['rename', { kind: 'invalid', fieldErrors: {} }, '제목을 고치지 못했습니다'],
    ['delete', conflict, '방송 중에는 지울 수 없습니다'],
    ['delete', { kind: 'forbidden' }, '소유자만 지울 수 있습니다'],
    ['delete', { kind: 'notFound' }, '이미 지워진 방송입니다'],
    ['delete', { kind: 'unauthorized' }, '방송을 지우지 못했습니다. 잠시 뒤 다시 시도하세요'],
    ['end', { kind: 'forbidden' }, '소유자만 종료할 수 있습니다'],
    ['end', { kind: 'notFound' }, '이미 지워진 방송입니다'],
    ['end', conflict, '송출을 종료하지 못했습니다. 잠시 뒤 다시 시도하세요'],
    ['end', { kind: 'unknown' }, '송출을 종료하지 못했습니다. 잠시 뒤 다시 시도하세요'],
  ] as const)('%s / %j', (action, failure, message) => {
    expect(manageFailureMessage(action, failure)).toBe(message)
  })
})
