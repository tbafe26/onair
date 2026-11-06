import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { signedInAs } from '../test/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

// 결제창이 실패 주소로 돌아온 뒤의 기록 화면을 확인한다. 상태 전이 규칙은 백엔드 테스트가 맡는다.
function stubBroadcast() {
  server.use(
    http.get('/api/broadcasts/5', () =>
      HttpResponse.json({
        id: 5,
        kind: 'LIVE',
        title: '후원 라이브',
        createdAt: '2026-03-15T12:00:00Z',
        owner: { id: 9, nickname: '소유자닉' },
        thumbnailUrl: null,
        status: 'ON_AIR',
        endedAt: null,
      }),
    ),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )
}

function stubFail(respond: () => Response = () => HttpResponse.json({ status: 'CANCELED' })) {
  const received: { orderId: string; body: unknown }[] = []
  server.use(
    http.post('/api/donations/:orderId/fail', async ({ request, params }) => {
      received.push({ orderId: String(params.orderId), body: await request.json() })
      return respond()
    }),
  )
  return received
}

it('결제창을 닫으면 취소로 기록하고 방송 화면에서 후원을 취소했다고 알린다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  const received = stubFail()
  const app = renderApp('/donations/fail?orderId=order-abcdef&broadcastId=5&code=PAY_PROCESS_CANCELED&message=cancel')

  expect(await screen.findByRole('alert', { name: '후원 결과' })).toHaveTextContent('후원을 취소했습니다')
  expect(app.router.state.location.pathname).toBe('/broadcasts/5')
  expect(received).toEqual([{ orderId: 'order-abcdef', body: { code: 'PAY_PROCESS_CANCELED' } }])
})

it('결제가 거절되면 실패로 기록하고 이유와 다시 시도 안내를 보여 준다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  const received = stubFail(() => HttpResponse.json({ status: 'FAILED' }))
  const app = renderApp(
    '/donations/fail?orderId=order-abcdef&broadcastId=5&code=REJECT_CARD_COMPANY&message=%EC%B9%B4%EB%93%9C%EC%82%AC+%EA%B1%B0%EC%A0%88',
  )

  const alert = await screen.findByRole('alert', { name: '후원 결과' })
  expect(alert).toHaveTextContent('카드사 거절')
  expect(alert).toHaveTextContent('다시 시도')
  expect(app.router.state.location.pathname).toBe('/broadcasts/5')
  expect(received).toEqual([{ orderId: 'order-abcdef', body: { code: 'REJECT_CARD_COMPANY' } }])
})

it('기록 API가 실패해도 방송 화면으로 돌아가 결과를 알린다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  stubFail(() => HttpResponse.json({ status: 500, title: '오류' }, { status: 500 }))
  const app = renderApp('/donations/fail?orderId=order-abcdef&broadcastId=5&code=PAY_PROCESS_CANCELED')

  expect(await screen.findByRole('alert', { name: '후원 결과' })).toHaveTextContent('후원을 취소했습니다')
  expect(app.router.state.location.pathname).toBe('/broadcasts/5')
})

it('주문 번호나 코드가 없으면 기록 API를 부르지 않고 오류와 목록 링크를 보여 준다', async () => {
  signedInAs('시청자닉', 'viewer01')
  const received = stubFail()
  renderApp('/donations/fail?broadcastId=5&code=PAY_PROCESS_CANCELED')

  expect(await screen.findByRole('heading', { name: '결제 결과를 확인하지 못했습니다' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '목록으로 돌아가기' })).toHaveAttribute('href', '/')
  expect(received).toEqual([])
})

it('로그인하지 않았으면 기록하지 않고 로그인 화면으로 보낸다', async () => {
  const received = stubFail()
  const app = renderApp('/donations/fail?orderId=order-abcdef&broadcastId=5&code=PAY_PROCESS_CANCELED')

  await waitFor(() => expect(app.router.state.location.pathname).toBe('/login'))
  expect(received).toEqual([])
})
