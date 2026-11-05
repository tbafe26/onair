import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { expect, it } from 'vitest'
import { shouldRetryQuery } from './query-retry'

function httpError(status: number): AxiosError {
  const response = {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { status },
  } as AxiosResponse
  return new AxiosError('요청 실패', undefined, undefined, undefined, response)
}

it('없는 방송(404)은 다시 시도하지 않아 안내가 바로 나온다', () => {
  expect(shouldRetryQuery(0, httpError(404))).toBe(false)
})

it('원인을 모르는 실패(5xx, 연결 끊김)는 세 번까지만 다시 시도한다', () => {
  expect(shouldRetryQuery(0, httpError(500))).toBe(true)
  expect(shouldRetryQuery(2, new Error('연결 끊김'))).toBe(true)
  expect(shouldRetryQuery(3, httpError(503))).toBe(false)
})
