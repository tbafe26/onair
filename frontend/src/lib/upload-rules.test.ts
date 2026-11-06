import { expect, it } from 'vitest'
import { formatLimit, validateTitle } from './upload-rules'

it('상한 표기는 서버와 같은 규칙으로 MB, KB, 바이트 순으로 딱 떨어지는 단위를 쓴다', () => {
  expect(formatLimit(200 * 1024 * 1024)).toBe('200MB')
  expect(formatLimit(1500 * 1024)).toBe('1500KB')
  expect(formatLimit(1000)).toBe('1000바이트')
})

it('제목의 앞뒤 공백은 서버와 같은 기준으로 뗀다(줄 바꿈 없는 공백, 전각 공백 포함)', () => {
  expect(validateTitle(' 　\t', 100)).toBe('제목을 입력하세요')
  expect(validateTitle(' ' + '가'.repeat(100) + '　', 100)).toBeNull()
  expect(validateTitle('가'.repeat(101), 100)).toBe('제목은 100자 이하로 입력하세요')
})

