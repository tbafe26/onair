import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { signedInAs } from '../test/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

// 후원 창과 버튼 표시 조건을 화면으로 확인한다. 결제창은 가짜이고, 서버 규칙은 백엔드 테스트가 맡는다.
const ORDER = { orderId: 'order-abcdef', amount: 5000, orderName: '온에어 방송 후원', clientKey: 'test_gck_dummy' }

function stubBroadcast(kind: 'LIVE' | 'RECORDING' = 'LIVE', status: 'ON_AIR' | 'ENDED' = 'ON_AIR') {
  const owner = { id: 9, nickname: '소유자닉' }
  const live = { id: 5, kind: 'LIVE', title: '후원 라이브', createdAt: '2026-03-15T12:00:00Z', owner, thumbnailUrl: null }
  server.use(
    http.get('/api/broadcasts/5', () =>
      HttpResponse.json(
        kind === 'LIVE'
          ? { ...live, status, endedAt: status === 'ENDED' ? '2026-03-15T13:00:00Z' : null }
          : {
              ...live,
              kind: 'RECORDING',
              video: { url: '/v', contentType: 'video/mp4', thumbnailUrl: null, durationSeconds: 3 },
            },
      ),
    ),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
    http.get('/api/broadcasts/5/comments', () => HttpResponse.json({ items: [], nextCursor: null, totalCount: 0 })),
  )
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '후원' }))
  return screen.getByRole('dialog', { name: '후원하기' })
}

function stubOrder(received: unknown[] = []) {
  server.use(
    http.post('/api/broadcasts/5/donations', async ({ request }) => {
      received.push(await request.json())
      return HttpResponse.json(ORDER, { status: 201 })
    }),
  )
  return received
}

it('로그인한 시청자는 금액 버튼을 고르고 받는 사람과 금액을 확인한 뒤 결제창을 연다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  const received = stubOrder()
  const user = userEvent.setup()
  const app = renderApp('/broadcasts/5')

  const dialog = await openDialog(user)
  await user.click(within(dialog).getByRole('button', { name: '5,000원' }))
  await user.type(within(dialog).getByLabelText('메시지(선택)'), '  힘내세요  ')

  expect(within(dialog).getByText('소유자닉')).toBeInTheDocument()
  expect(within(dialog).getAllByText('5,000원').length).toBeGreaterThan(1)
  await user.click(within(dialog).getByRole('button', { name: '다음' }))

  await waitFor(() => expect(app.payment.render).toHaveBeenCalledTimes(1))
  expect(received).toEqual([{ amount: 5000, message: '힘내세요' }])
  expect(app.payment.render).toHaveBeenCalledWith({
    clientKey: 'test_gck_dummy',
    amount: 5000,
    paymentMethodSelector: '#donation-payment-methods',
    agreementSelector: '#donation-payment-agreement',
  })
  expect(within(dialog).getByText(/테스트 결제입니다. 실제 카드·개인정보를 입력하지 마세요/)).toBeInTheDocument()
  expect(app.payment.session.requestPayment).not.toHaveBeenCalled()

  await user.click(await within(dialog).findByRole('button', { name: '후원하기' }))

  await waitFor(() => expect(app.payment.session.requestPayment).toHaveBeenCalledTimes(1))
  const request = app.payment.session.requestPayment.mock.calls[0][0]
  expect(request).toEqual({
    orderId: 'order-abcdef',
    orderName: '온에어 방송 후원',
    successUrl: `${window.location.origin}/donations/success?broadcastId=5`,
    failUrl: `${window.location.origin}/donations/fail?orderId=order-abcdef&broadcastId=5`,
  })
  // 닉네임과 메시지 같은 구매자 정보는 결제위젯에 넘기지 않는다.
  const sent = JSON.stringify([app.payment.render.mock.calls, request])
  expect(sent).not.toContain('시청자닉')
  expect(sent).not.toContain('힘내세요')
})

it('이전을 누르면 금액을 바꿔 새 주문으로 위젯을 다시 그린다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  const received = stubOrder()
  const user = userEvent.setup()
  const app = renderApp('/broadcasts/5')

  const dialog = await openDialog(user)
  await user.type(within(dialog).getByLabelText('금액(원)'), '5000')
  await user.click(within(dialog).getByRole('button', { name: '다음' }))
  await user.click(await within(dialog).findByRole('button', { name: '이전' }))
  const input = within(dialog).getByLabelText('금액(원)')
  expect(input).toHaveValue('5000')
  await user.clear(input)
  await user.type(input, '7000')
  await user.click(within(dialog).getByRole('button', { name: '다음' }))

  await waitFor(() => expect(app.payment.render).toHaveBeenCalledTimes(2))
  expect(received).toEqual([{ amount: 5000 }, { amount: 7000 }])
})

it('금액을 직접 입력할 수 있고 메시지를 비우면 보내지 않는다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  const received = stubOrder()
  const user = userEvent.setup()
  const app = renderApp('/broadcasts/5')

  const dialog = await openDialog(user)
  await user.type(within(dialog).getByLabelText('금액(원)'), '12000')
  await user.click(within(dialog).getByRole('button', { name: '다음' }))

  await waitFor(() => expect(app.payment.render).toHaveBeenCalled())
  expect(received).toEqual([{ amount: 12000 }])
})

it('규칙에 맞지 않는 금액은 결제창을 열기 전에 칸에 이유를 보여 준다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  const received = stubOrder()
  const user = userEvent.setup()
  const app = renderApp('/broadcasts/5')

  const dialog = await openDialog(user)
  expect(within(dialog).getByText(/1,000원 이상 500,000원 이하, 1,000원 단위/)).toBeInTheDocument()
  for (const bad of ['', '999', '1500', '500001', '12a']) {
    const input = within(dialog).getByLabelText('금액(원)')
    await user.clear(input)
    if (bad) await user.type(input, bad)
    await user.click(within(dialog).getByRole('button', { name: '다음' }))
    expect(await within(dialog).findByText(/1,000원 이상 500,000원 이하, 1,000원 단위/, { selector: '[id$="-error"]' })).toBeInTheDocument()
  }

  expect(received).toEqual([])
  expect(app.payment.render).not.toHaveBeenCalled()
})

it('서버가 알려 준 칸별 오류와 후원 불가 이유를 보여 주고 결제창은 열지 않는다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  const user = userEvent.setup()
  const app = renderApp('/broadcasts/5')
  server.use(
    http.post('/api/broadcasts/5/donations', () =>
      HttpResponse.json(
        { status: 400, title: '잘못된 입력', errors: [{ field: 'message', reason: '서버: 메시지가 깁니다' }] },
        { status: 400 },
      ),
    ),
  )

  const dialog = await openDialog(user)
  await user.type(within(dialog).getByLabelText('금액(원)'), '5000')
  await user.click(within(dialog).getByRole('button', { name: '다음' }))
  expect(await within(dialog).findByText('서버: 메시지가 깁니다')).toBeInTheDocument()

  server.use(
    http.post('/api/broadcasts/5/donations', () =>
      HttpResponse.json({ status: 503, title: '결제 설정 없음' }, { status: 503 }),
    ),
  )
  await user.click(within(dialog).getByRole('button', { name: '다음' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('결제 설정')

  server.use(
    http.post('/api/broadcasts/5/donations', () =>
      HttpResponse.json({ status: 409, title: '후원 불가', detail: '방송이 끝났습니다' }, { status: 409 }),
    ),
  )
  await user.click(within(dialog).getByRole('button', { name: '다음' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('방송 중인 라이브방송에만')
  expect(app.payment.render).not.toHaveBeenCalled()
})

it('위젯을 그리지 못하거나 결제창을 열지 못하면 오류를 보여 준다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  stubOrder()
  const user = userEvent.setup()
  const app = renderApp('/broadcasts/5')
  app.payment.render.mockRejectedValueOnce(new Error('SDK 로드 실패'))

  const dialog = await openDialog(user)
  await user.type(within(dialog).getByLabelText('금액(원)'), '5000')
  await user.click(within(dialog).getByRole('button', { name: '다음' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('결제 화면을 불러오지 못했습니다')

  await user.click(within(dialog).getByRole('button', { name: '이전' }))
  await user.click(within(dialog).getByRole('button', { name: '다음' }))
  app.payment.session.requestPayment.mockRejectedValueOnce(new Error('열기 실패'))
  await user.click(await within(dialog).findByRole('button', { name: '후원하기' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('결제창을 열지 못했습니다')
})

it('비로그인은 후원 버튼 대신 로그인 안내와 링크를 본다', async () => {
  stubBroadcast()
  renderApp('/broadcasts/5')

  expect(await screen.findByText(/로그인 후 후원할 수 있습니다/)).toBeInTheDocument()
  const guide = (await screen.findByText(/로그인 후 후원할 수 있습니다/)).closest('p')!
  expect(within(guide).getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login?next=%2Fbroadcasts%2F5')
  expect(screen.queryByRole('button', { name: '후원' })).not.toBeInTheDocument()
})

it('소유자에게는 후원 버튼이 없다', async () => {
  signedInAs('소유자닉', 'owner01')
  server.use(http.get('/api/auth/me', () => HttpResponse.json({ id: 9, loginId: 'owner01', nickname: '소유자닉' })))
  stubBroadcast()
  renderApp('/broadcasts/5')

  await screen.findByRole('heading', { name: '후원 라이브' })
  expect(screen.queryByRole('button', { name: '후원' })).not.toBeInTheDocument()
  expect(screen.queryByText(/로그인 후 후원/)).not.toBeInTheDocument()
})

it('종료된 라이브방송에는 후원 버튼도 안내도 없다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast('LIVE', 'ENDED')
  renderApp('/broadcasts/5')

  await screen.findByText('방송이 종료되었습니다')
  expect(screen.queryByRole('button', { name: '후원' })).not.toBeInTheDocument()
})

it('녹화방송에는 후원 영역이 없다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast('RECORDING')
  renderApp('/broadcasts/5')

  await screen.findByRole('heading', { name: '후원 라이브' })
  expect(screen.queryByRole('button', { name: '후원' })).not.toBeInTheDocument()
  expect(screen.queryByText(/후원할 수 있습니다/)).not.toBeInTheDocument()
})

it('메시지 글자 수는 이모지를 한 글자로 세고 100자까지만 받는다', async () => {
  signedInAs('시청자닉', 'viewer01')
  stubBroadcast()
  const user = userEvent.setup()
  renderApp('/broadcasts/5')

  const dialog = await openDialog(user)
  const field = within(dialog).getByLabelText('메시지(선택)')
  await user.click(field)
  await user.paste('🙂'.repeat(101))

  expect(Array.from((field as HTMLTextAreaElement).value)).toHaveLength(100)
  expect(within(dialog).getByText('100/100자')).toBeInTheDocument()
})
