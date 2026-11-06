import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

// 후원 내역 영역의 표시를 화면으로 확인한다. 확정만 나오는 규칙과 커서 규칙은 백엔드 테스트가 맡는다.
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

const first = {
  id: 12,
  amount: 10_000,
  message: '<b>힘내세요</b>',
  donor: { id: 3, nickname: '후원자A' },
  confirmedAt: '2026-03-15T12:30:00Z',
}
const second = { id: 11, amount: 5_000, message: null, donor: { id: 4, nickname: '후원자B' }, confirmedAt: '2026-03-15T12:20:00Z' }
const third = { id: 10, amount: 1_000, message: '응원', donor: { id: 3, nickname: '후원자A' }, confirmedAt: '2026-03-15T12:10:00Z' }

it('후원 영역에 합계와 건수와 최신순 내역을 로그인 없이 보인다', async () => {
  stubBroadcast()
  server.use(
    http.get('/api/broadcasts/5/donations', () =>
      HttpResponse.json({ total: { amount: 16_000, count: 3 }, items: [first, second, third], nextCursor: null }),
    ),
  )

  renderApp('/broadcasts/5')

  const area = await screen.findByRole('region', { name: '후원' })
  expect(await within(area).findByText('16,000원')).toBeInTheDocument()
  expect(within(area).getByText('3건')).toBeInTheDocument()
  const items = within(within(area).getByRole('list', { name: '후원 내역' })).getAllByRole('listitem')
  expect(items).toHaveLength(3)
  expect(items[0]).toHaveTextContent('후원자A')
  expect(items[0]).toHaveTextContent('10,000원')
  expect(items[0]).toHaveTextContent('<b>힘내세요</b>')
  expect(items[1]).toHaveTextContent('후원자B')
  expect(items[1]).toHaveTextContent('5,000원')
  expect(within(area).queryByRole('button', { name: '후원 더 보기' })).not.toBeInTheDocument()
})

it('후원이 없으면 안내를 보인다', async () => {
  stubBroadcast()
  server.use(
    http.get('/api/broadcasts/5/donations', () =>
      HttpResponse.json({ total: { amount: 0, count: 0 }, items: [], nextCursor: null }),
    ),
  )

  renderApp('/broadcasts/5')

  const area = await screen.findByRole('region', { name: '후원' })
  expect(await within(area).findByText('아직 후원이 없습니다')).toBeInTheDocument()
  expect(within(area).getByText('0원')).toBeInTheDocument()
})

it('더 보기를 누르면 커서로 이어 불러와 아래에 붙인다', async () => {
  stubBroadcast()
  const cursors: Array<string | null> = []
  server.use(
    http.get('/api/broadcasts/5/donations', ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor')
      cursors.push(cursor)
      return HttpResponse.json(
        cursor === null
          ? { total: { amount: 16_000, count: 3 }, items: [first, second], nextCursor: 'c1_11' }
          : { total: { amount: 16_000, count: 3 }, items: [third], nextCursor: null },
      )
    }),
  )
  const user = userEvent.setup()

  renderApp('/broadcasts/5')

  const area = await screen.findByRole('region', { name: '후원' })
  await user.click(await within(area).findByRole('button', { name: '후원 더 보기' }))

  await waitFor(() => expect(within(area).getAllByRole('listitem')).toHaveLength(3))
  expect(cursors).toEqual([null, 'c1_11'])
  expect(within(area).queryByRole('button', { name: '후원 더 보기' })).not.toBeInTheDocument()
})

it('종료된 라이브방송에서도 후원 내역이 보인다', async () => {
  stubBroadcast('LIVE', 'ENDED')
  server.use(
    http.get('/api/broadcasts/5/donations', () =>
      HttpResponse.json({ total: { amount: 5_000, count: 1 }, items: [second], nextCursor: null }),
    ),
  )

  renderApp('/broadcasts/5')

  const area = await screen.findByRole('region', { name: '후원' })
  expect(await within(area).findByText('후원자B')).toBeInTheDocument()
})

it('내역을 불러오지 못하면 다시 시도할 수 있다', async () => {
  stubBroadcast()
  let calls = 0
  server.use(
    http.get('/api/broadcasts/5/donations', () => {
      calls += 1
      return calls === 1
        ? HttpResponse.json({ status: 500 }, { status: 500 })
        : HttpResponse.json({ total: { amount: 5_000, count: 1 }, items: [second], nextCursor: null })
    }),
  )
  const user = userEvent.setup()

  renderApp('/broadcasts/5')

  const area = await screen.findByRole('region', { name: '후원' })
  await user.click(await within(area).findByRole('button', { name: '다시 시도' }))
  expect(await within(area).findByText('후원자B')).toBeInTheDocument()
})

it('녹화방송에는 후원 영역이 없다', async () => {
  stubBroadcast('RECORDING')
  let asked = false
  server.use(
    http.get('/api/broadcasts/5/donations', () => {
      asked = true
      return HttpResponse.json({ total: { amount: 0, count: 0 }, items: [], nextCursor: null })
    }),
  )

  renderApp('/broadcasts/5')

  expect(await screen.findByRole('heading', { name: /댓글/ })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '후원' })).not.toBeInTheDocument()
  expect(asked).toBe(false)
})

it('방송 중 채팅으로 온 후원은 합계를 바꾸고 내역 맨 위에 한 번만 붙는다', async () => {
  stubBroadcast()
  server.use(
    http.get('/api/broadcasts/5/donations', () =>
      HttpResponse.json({ total: { amount: 6_000, count: 2 }, items: [second, third], nextCursor: null }),
    ),
  )
  const app = renderApp('/broadcasts/5')
  const area = await screen.findByRole('region', { name: '후원' })
  expect(await within(area).findByText('6,000원')).toBeInTheDocument()

  const event = { ...first, total: { amount: 16_000, count: 3 } }
  act(() => app.fake.chat.setState({ phase: 'open', comments: [], donations: [event] }))

  expect(await within(area).findByText('16,000원')).toBeInTheDocument()
  expect(within(area).getByText('3건')).toBeInTheDocument()
  let items = within(within(area).getByRole('list', { name: '후원 내역' })).getAllByRole('listitem')
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining('후원자A'),
    expect.stringContaining('후원자B'),
    expect.stringContaining('후원자A'),
  ])
  expect(items[0]).toHaveTextContent('10,000원')

  // 같은 후원이 다시 상태에 실려 와도 늘어나지 않는다.
  act(() => app.fake.chat.setState({ phase: 'open', comments: [], donations: [event, { ...event }] }))
  items = within(within(area).getByRole('list', { name: '후원 내역' })).getAllByRole('listitem')
  expect(items).toHaveLength(3)
  expect(within(area).getByText('3건')).toBeInTheDocument()
})

it('채팅이 다시 연결되면 끊긴 동안 놓친 후원을 다시 불러와 합계를 맞춘다', async () => {
  stubBroadcast()
  let body = { total: { amount: 6_000, count: 2 }, items: [second, third], nextCursor: null as string | null }
  server.use(http.get('/api/broadcasts/5/donations', () => HttpResponse.json(body)))
  const app = renderApp('/broadcasts/5')
  const area = await screen.findByRole('region', { name: '후원' })
  expect(await within(area).findByText('6,000원')).toBeInTheDocument()

  body = { total: { amount: 16_000, count: 3 }, items: [first, second, third], nextCursor: null }
  act(() => app.fake.chat.emitReconnected())

  expect(await within(area).findByText('16,000원')).toBeInTheDocument()
  expect(within(area).getByText('3건')).toBeInTheDocument()
})
