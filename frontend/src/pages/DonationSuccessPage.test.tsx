import { screen, waitFor } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { signedInAs } from '../test/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

// 결제창이 성공 주소로 돌아온 뒤의 승인 화면을 확인한다. 서버의 대조와 확정 규칙은 백엔드 테스트가 맡는다.
const SUCCESS_URL = '/donations/success?broadcastId=5&paymentKey=pk_1&orderId=order-abcdef&amount=5000'
const CONFIRMED = {
  id: 1,
  amount: 5000,
  message: null,
  donor: { id: 1, nickname: '시청자닉' },
  confirmedAt: '2026-03-15T12:30:00Z',
}

function stubBroadcast() {
  const owner = { id: 9, nickname: '소유자닉' }
  server.use(
    http.get('/api/broadcasts/5', () =>
      HttpResponse.json({
        id: 5,
        kind: 'LIVE',
        title: '후원 라이브',
        createdAt: '2026-03-15T12:00:00Z',
        owner,
        thumbnailUrl: null,
        status: 'ON_AIR',
        endedAt: null,
      }),
    ),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )
}

function stubConfirm(respond: () => Response | Promise<Response>) {
  const received: unknown[] = []
  server.use(
    http.post('/api/donations/confirm', async ({ request }) => {
      received.push(await request.json())
      return respond()
    }),
  )
  return received
}

it('쿼리의 값으로 승인 API를 한 번 부르고 방송 화면으로 돌아가 후원 결과를 보여 준다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  const received = stubConfirm(() => HttpResponse.json(CONFIRMED))
  const app = renderApp(SUCCESS_URL)

  expect(await screen.findByRole('status', { name: '후원 결과' })).toHaveTextContent('5,000원을 후원했습니다')
  expect(app.router.state.location.pathname).toBe('/broadcasts/5')
  expect(received).toEqual([{ paymentKey: 'pk_1', orderId: 'order-abcdef', amount: 5000 }])
})

it('승인하는 동안 후원을 확인하는 중이라고 알린다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  stubConfirm(async () => {
    await delay(50)
    return HttpResponse.json(CONFIRMED)
  })
  renderApp(SUCCESS_URL)

  expect(await screen.findByText('후원을 확인하는 중')).toBeInTheDocument()
  expect(await screen.findByRole('status', { name: '후원 결과' })).toBeInTheDocument()
})

it('승인이 거절되면 방송 화면으로 돌아가 실패 이유를 보여 준다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  stubConfirm(() => HttpResponse.json({ status: 402, title: '결제 거절' }, { status: 402 }))
  const app = renderApp(SUCCESS_URL)

  expect(await screen.findByRole('alert', { name: '후원 결과' })).toHaveTextContent('결제가 승인되지 않아 후원하지 못했습니다')
  expect(app.router.state.location.pathname).toBe('/broadcasts/5')
})

it('금액이 달라 거절된 승인은 금액 불일치 문구를 보여 준다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  stubConfirm(() => HttpResponse.json({ status: 400, title: '금액 불일치' }, { status: 400 }))
  renderApp(SUCCESS_URL)

  expect(await screen.findByRole('alert', { name: '후원 결과' })).toHaveTextContent('결제 금액이 주문과 달라')
})

it('쿼리가 모자라면 승인 API를 부르지 않고 오류와 목록 링크를 보여 준다', async () => {
  signedInAs('시청자닉', 'viewer01')
  const received = stubConfirm(() => HttpResponse.json(CONFIRMED))
  renderApp('/donations/success?broadcastId=5&orderId=order-abcdef')

  expect(await screen.findByRole('heading', { name: '후원을 확인하지 못했습니다' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '목록으로 돌아가기' })).toHaveAttribute('href', '/')
  expect(received).toEqual([])
})

it('방송 id가 없으면 실패를 이 화면에 보여 준다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  stubConfirm(() => HttpResponse.json({ status: 409, title: '충돌' }, { status: 409 }))
  const app = renderApp('/donations/success?paymentKey=pk_1&orderId=order-abcdef&amount=5000')

  expect(await screen.findByRole('heading', { name: '후원을 확인하지 못했습니다' })).toBeInTheDocument()
  expect(screen.getByText(/이미 실패했거나 취소된 후원/)).toBeInTheDocument()
  expect(app.router.state.location.pathname).toBe('/donations/success')
})

it('로그인하지 않았으면 승인하지 않고 로그인 화면으로 보낸다', async () => {
  const received = stubConfirm(() => HttpResponse.json(CONFIRMED))
  const app = renderApp(SUCCESS_URL)

  await waitFor(() => expect(app.router.state.location.pathname).toBe('/login'))
  expect(received).toEqual([])
})
