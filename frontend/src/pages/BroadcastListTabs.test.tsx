import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

function recording(id: number) {
  return {
    id,
    kind: 'RECORDING',
    title: `녹화 ${id}`,
    createdAt: '2026-03-15T12:00:00Z',
    owner: { id: 1, nickname: '방송러' },
    durationSeconds: 60,
    thumbnailUrl: null,
  }
}

// kind별로 다른 목록을 돌려주고, 받은 쿼리를 기록하는 서버 흉내.
function useKindServer(requests: string[] = []) {
  server.use(
    http.get('/api/broadcasts', ({ request }) => {
      const url = new URL(request.url)
      requests.push(url.search)
      if (url.searchParams.get('kind') === 'LIVE') {
        return HttpResponse.json({ items: [], hasNext: false })
      }
      return HttpResponse.json({ items: [recording(2), recording(1)], hasNext: false })
    }),
  )
}

function tab(name: string) {
  return within(screen.getByRole('tablist', { name: '방송 종류' })).getByRole('tab', { name })
}

it('"전체 방송" 제목 아래에 라이브와 녹화방송 탭이 이 순서로 보인다', async () => {
  useKindServer()

  renderApp('/')

  const tabs = within(await screen.findByRole('tablist', { name: '방송 종류' })).getAllByRole('tab')
  expect(tabs.map((t) => t.textContent)).toEqual(['라이브', '녹화방송'])
})

it('주소에 kind가 없으면 라이브 탭이 선택되고 라이브 목록을 받는다', async () => {
  const requests: string[] = []
  useKindServer(requests)

  renderApp('/')

  expect(await screen.findByText('라이브 방송이 없습니다')).toBeInTheDocument()
  expect(tab('라이브')).toHaveAttribute('aria-selected', 'true')
  expect(tab('녹화방송')).toHaveAttribute('aria-selected', 'false')
  expect(requests).toEqual(['?kind=LIVE'])
})

it('알 수 없는 kind 주소는 기본 탭으로 본다', async () => {
  useKindServer()

  renderApp('/?kind=VOD')

  expect(await screen.findByText('라이브 방송이 없습니다')).toBeInTheDocument()
  expect(tab('라이브')).toHaveAttribute('aria-selected', 'true')
})

it('주소의 kind=LIVE로 열면 라이브 탭이 선택되고 라이브 목록을 받는다', async () => {
  const requests: string[] = []
  useKindServer(requests)

  renderApp('/?kind=LIVE')

  expect(await screen.findByText('라이브 방송이 없습니다')).toBeInTheDocument()
  expect(tab('라이브')).toHaveAttribute('aria-selected', 'true')
  expect(screen.queryByText('등록된 방송이 없습니다')).not.toBeInTheDocument()
  expect(
    within(screen.getByRole('main')).getByRole('link', { name: '라이브 송출' }),
  ).toHaveAttribute('href', '/broadcasts/live/new')
  expect(requests).toEqual(['?kind=LIVE'])
})

it('탭을 누르면 그 종류의 첫 묶음부터 다시 불러오고 주소에 남는다', async () => {
  const requests: string[] = []
  useKindServer(requests)
  const user = userEvent.setup()

  const { router } = renderApp('/?kind=RECORDING')
  await screen.findByRole('link', { name: /녹화 2/ })

  await user.click(tab('라이브'))
  expect(await screen.findByText('라이브 방송이 없습니다')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /녹화 2/ })).not.toBeInTheDocument()
  expect(router.state.location.search).toBe('?kind=LIVE')

  await user.click(tab('녹화방송'))
  expect(await screen.findByRole('link', { name: /녹화 2/ })).toBeInTheDocument()
  expect(router.state.location.search).toBe('?kind=RECORDING')
  await waitFor(() => expect(tab('녹화방송')).toHaveAttribute('aria-selected', 'true'))
  expect(requests.slice(0, 2)).toEqual(['?kind=RECORDING', '?kind=LIVE'])
})

it('녹화방송 탭에 방송이 없으면 1단계의 빈 상태와 등록 버튼을 보여 준다', async () => {
  server.use(http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })))

  renderApp('/?kind=RECORDING')

  expect(await screen.findByText('등록된 방송이 없습니다')).toBeInTheDocument()
  expect(
    within(screen.getByRole('main')).getByRole('link', { name: '방송 등록' }),
  ).toHaveAttribute('href', '/broadcasts/new')
})
