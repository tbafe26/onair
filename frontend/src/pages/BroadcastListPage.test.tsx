import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { observedElementCount, revealObservedElements } from '../test/intersection'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

it('방송이 없으면 빈 목록 안내와 등록 화면으로 가는 버튼을 보여 준다', async () => {
  server.use(
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )

  renderApp('/?kind=RECORDING')

  expect(await screen.findByText('등록된 방송이 없습니다')).toBeInTheDocument()
  expect(
    within(screen.getByRole('main')).getByRole('link', { name: '방송 등록' }),
  ).toHaveAttribute('href', '/broadcasts/new')
})

it('빈 목록의 등록 화면 이동은 민트 알약 버튼 모양이다', async () => {
  server.use(
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )

  renderApp('/?kind=RECORDING')

  await screen.findByText('등록된 방송이 없습니다')
  const link = within(screen.getByRole('main')).getByRole('link', { name: '방송 등록' })
  // 모양은 스타일 클래스로만 드러나므로, 주요 행동 버튼(민트 알약)의 클래스를 확인한다.
  expect(link).toHaveClass('bg-primary', 'rounded-full')
})

it('방송 카드에 배지, 재생 시간, 제목, 등록일을 보여 주고 상세 화면으로 연결한다', async () => {
  server.use(
    http.get('/api/broadcasts', () =>
      HttpResponse.json({
        items: [
          {
            id: 12,
            kind: 'RECORDING',
            title: '긴 방송',
            createdAt: '2026-03-15T12:00:00Z',
            durationSeconds: 3723.4,
            thumbnailUrl: '/api/broadcasts/12/thumbnail',
          },
          {
            id: 11,
            kind: 'RECORDING',
            title: '짧은 방송',
            createdAt: '2026-01-02T12:00:00Z',
            durationSeconds: 125,
            thumbnailUrl: null,
          },
          {
            id: 10,
            kind: 'RECORDING',
            title: '시간 정보 없는 방송',
            createdAt: '2025-12-31T12:00:00Z',
            durationSeconds: null,
            thumbnailUrl: null,
          },
        ],
        hasNext: false,
      }),
    ),
  )

  renderApp('/?kind=RECORDING')

  const longCard = (await screen.findByRole('link', { name: /긴 방송/ })) as HTMLElement
  expect(longCard).toHaveAttribute('href', '/broadcasts/12')
  expect(within(longCard).getByText('01:02:03')).toBeInTheDocument()
  expect(within(longCard).getByText('03.15')).toBeInTheDocument()
  expect(longCard.querySelector('img')).toHaveAttribute('src', '/api/broadcasts/12/thumbnail')
  expect(within(longCard).queryByLabelText('썸네일 없음')).not.toBeInTheDocument()

  const shortCard = screen.getByRole('link', { name: /짧은 방송/ })
  expect(within(shortCard).getByText('02:05')).toBeInTheDocument()
  expect(within(shortCard).getByText('01.02')).toBeInTheDocument()
  expect(within(shortCard).getByLabelText('썸네일 없음')).toBeInTheDocument()

  const noDurationCard = screen.getByRole('link', { name: /시간 정보 없는 방송/ })
  expect(within(noDurationCard).queryByText(/^\d\d:\d\d/)).not.toBeInTheDocument()
})

// id가 큰 쪽이 최신이다. 전체 total개 중 before보다 작은 것을 size개씩 돌려주는 서버 흉내.
function useCursorServer(total: number, requests: string[] = []) {
  server.use(
    http.get('/api/broadcasts', ({ request }) => {
      const url = new URL(request.url)
      requests.push(url.search)
      const before = Number(url.searchParams.get('before') ?? total + 1)
      const size = 5
      const ids = Array.from({ length: total }, (_, i) => total - i).filter((id) => id < before)
      return HttpResponse.json({
        items: ids.slice(0, size).map((id) => ({
          id,
          kind: 'RECORDING',
          title: `방송 ${id}`,
          createdAt: '2026-03-15T12:00:00Z',
          durationSeconds: 60,
          thumbnailUrl: null,
        })),
        hasNext: ids.length > size,
      })
    }),
  )
}

function cardCount() {
  return screen.queryAllByRole('link', { name: /방송 \d+/ }).length
}

it('목록 끝에 닿으면 마지막 방송 id를 before로 다음 묶음을 이어 붙인다', async () => {
  const requests: string[] = []
  useCursorServer(12, requests)

  renderApp('/?kind=RECORDING')
  await screen.findByRole('link', { name: /방송 12/ })
  expect(cardCount()).toBe(5)

  revealObservedElements()
  await screen.findByRole('link', { name: /방송 7(?!\d)/ })
  await waitFor(() => expect(cardCount()).toBe(10))
  expect(requests).toEqual(['?kind=RECORDING', '?kind=RECORDING&before=8'])
  // 중복 없이 이어 붙는다.
  expect(screen.getAllByRole('link', { name: /방송 8(?!\d)/ })).toHaveLength(1)
})

it('불러오는 동안 목록 끝에 로딩 표시를 보여 준다', async () => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  useCursorServer(12)
  server.use(
    http.get('/api/broadcasts', async ({ request }) => {
      if (new URL(request.url).searchParams.has('before')) await gate
    }),
  )
  // 위 핸들러는 before가 있을 때만 지연시키고, 없으면 다음 핸들러(useCursorServer)로 넘긴다.

  renderApp('/?kind=RECORDING')
  await screen.findByRole('link', { name: /방송 12/ })

  revealObservedElements()
  expect(await screen.findByRole('status', { name: '다음 방송을 불러오는 중' })).toBeInTheDocument()

  release()
  await waitFor(() =>
    expect(screen.queryByRole('status', { name: '다음 방송을 불러오는 중' })).not.toBeInTheDocument(),
  )
})

it('마지막 묶음 뒤에는 감시와 추가 요청이 없다', async () => {
  const requests: string[] = []
  useCursorServer(7, requests)

  renderApp('/?kind=RECORDING')
  await screen.findByRole('link', { name: /방송 7(?!\d)/ })
  revealObservedElements()
  await waitFor(() => expect(cardCount()).toBe(7))

  expect(observedElementCount()).toBe(0)
  revealObservedElements()
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(requests).toEqual(['?kind=RECORDING', '?kind=RECORDING&before=3'])
  expect(cardCount()).toBe(7)
})

it('첫 로딩 중에는 카드 모양 스켈레톤을 보여 준다', async () => {
  server.use(http.get('/api/broadcasts', () => new Promise(() => {})))

  renderApp('/?kind=RECORDING')

  expect(await screen.findByLabelText('방송 목록을 불러오는 중')).toBeInTheDocument()
  expect(screen.getAllByTestId('broadcast-card-skeleton').length).toBeGreaterThan(0)
})

it('첫 목록을 불러오지 못하면 오류 안내를 보이고 다시 시도하면 목록이 나온다', async () => {
  let fail = true
  server.use(
    http.get('/api/broadcasts', () =>
      fail
        ? HttpResponse.json({ title: 'x' }, { status: 500 })
        : HttpResponse.json({ items: [], hasNext: false }),
    ),
  )
  const user = userEvent.setup()

  renderApp('/?kind=RECORDING')
  expect(await screen.findByText('방송 목록을 불러오지 못했습니다.')).toBeInTheDocument()
  expect(screen.queryByText('등록된 방송이 없습니다')).not.toBeInTheDocument()

  fail = false
  await user.click(screen.getByRole('button', { name: '다시 시도' }))
  expect(await screen.findByText('등록된 방송이 없습니다')).toBeInTheDocument()
})

it('다음 묶음을 불러오다 실패하면 목록 끝에 다시 시도를 두고, 누르면 이어 붙는다', async () => {
  let failNext = true
  useCursorServer(8)
  server.use(
    http.get('/api/broadcasts', ({ request }) => {
      if (failNext && new URL(request.url).searchParams.has('before')) {
        return HttpResponse.json({ title: 'x' }, { status: 500 })
      }
    }),
  )
  const user = userEvent.setup()

  renderApp('/?kind=RECORDING')
  await screen.findByRole('link', { name: /방송 8(?!\d)/ })
  revealObservedElements()

  const retry = await screen.findByRole('button', { name: '다시 시도' })
  // 이미 본 방송은 그대로 남아 있다.
  expect(cardCount()).toBe(5)

  failNext = false
  await user.click(retry)
  await waitFor(() => expect(cardCount()).toBe(8))
  expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
})
