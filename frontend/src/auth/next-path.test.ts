import { expect, it } from 'vitest'
import { safeNextPath } from './next-path'

it('같은 사이트 안의 경로는 쿼리와 해시까지 그대로 돌려준다', () => {
  expect(safeNextPath('/broadcasts/live/new')).toBe('/broadcasts/live/new')
  expect(safeNextPath('/broadcasts/3?tab=chat#top')).toBe('/broadcasts/3?tab=chat#top')
})

it('없거나 비어 있으면 목록으로 보낸다', () => {
  expect(safeNextPath(null)).toBe('/')
  expect(safeNextPath('')).toBe('/')
})

it('외부 주소와 그렇게 해석될 수 있는 값은 목록으로 보낸다', () => {
  for (const unsafe of [
    'https://evil.example/',
    'http://evil.example/',
    '//evil.example/',
    '/\\evil.example/',
    '\\\\evil.example/',
    'javascript:alert(1)',
    'broadcasts/1',
    '/\t/evil.example/',
  ]) {
    expect(safeNextPath(unsafe), unsafe).toBe('/')
  }
})

it('로그인·가입 화면으로 되돌아가지 않는다', () => {
  expect(safeNextPath('/login')).toBe('/')
  expect(safeNextPath('/signup?next=/x')).toBe('/')
})
