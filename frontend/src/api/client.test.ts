import { http, HttpResponse } from 'msw'
import { afterEach, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { apiClient, onUnauthorized } from './client'

afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

function echoHeaders() {
  const seen: Record<string, string | null> = {}
  server.use(
    http.all('/api/echo', ({ request }) => {
      seen[request.method] = request.headers.get('X-XSRF-TOKEN')
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return seen
}

it('상태를 바꾸는 요청(POST·PATCH·DELETE)에는 쿠키의 CSRF 토큰을 헤더로 싣는다', async () => {
  document.cookie = 'XSRF-TOKEN=token-1; path=/'
  const seen = echoHeaders()

  await apiClient.post('/api/echo', new FormData())
  await apiClient.patch('/api/echo', { title: 'a' })
  await apiClient.delete('/api/echo')

  expect(seen).toEqual({ POST: 'token-1', PATCH: 'token-1', DELETE: 'token-1' })
})

it('조회 요청에는 CSRF 헤더를 싣지 않는다', async () => {
  document.cookie = 'XSRF-TOKEN=token-1; path=/'
  const seen = echoHeaders()

  await apiClient.get('/api/echo')

  expect(seen).toEqual({ GET: null })
})

it('토큰 쿠키가 없으면 헤더도 싣지 않는다', async () => {
  const seen = echoHeaders()

  await apiClient.post('/api/echo')

  expect(seen).toEqual({ POST: null })
})

it('401 응답이면 인증 상태에 알리고 오류는 그대로 던진다', async () => {
  server.use(http.get('/api/echo', () => new HttpResponse(null, { status: 401 })))
  const handler = vi.fn()
  const release = onUnauthorized(handler)

  await expect(apiClient.get('/api/echo')).rejects.toMatchObject({ response: { status: 401 } })

  expect(handler).toHaveBeenCalledTimes(1)
  release()
})

it('401이 아닌 실패는 인증 상태에 알리지 않는다', async () => {
  server.use(http.get('/api/echo', () => new HttpResponse(null, { status: 403 })))
  const handler = vi.fn()
  const release = onUnauthorized(handler)

  await expect(apiClient.get('/api/echo')).rejects.toMatchObject({ response: { status: 403 } })

  expect(handler).not.toHaveBeenCalled()
  release()
})
