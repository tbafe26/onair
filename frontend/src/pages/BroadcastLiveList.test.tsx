import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it, vi } from 'vitest'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

function live(id: number, status: 'ON_AIR' | 'ENDED', thumbnailUrl: string | null = null) {
  return {
    id,
    kind: 'LIVE',
    title: `라이브 ${id}`,
    createdAt: '2026-03-15T12:00:00Z',
    thumbnailUrl,
    status,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

function useLiveServer(requests: string[] = []) {
  server.use(
    http.get('/api/broadcasts', ({ request }) => {
      requests.push(new URL(request.url).search)
      return HttpResponse.json({
        items: [live(3, 'ON_AIR', '/api/broadcasts/3/thumbnail'), live(2, 'ENDED'), live(1, 'ENDED')],
        hasNext: false,
      })
    }),
  )
}

it('방송 중인 라이브 카드에는 LIVE 배지가, 종료된 카드에는 종료 배지가 붙는다', async () => {
  useLiveServer()

  renderApp('/')

  const onAir = await screen.findByRole('link', { name: /라이브 3/ })
  expect(within(onAir).getByText('LIVE')).toHaveClass('bg-red-600')
  expect(within(onAir).queryByText('종료')).not.toBeInTheDocument()
  const ended = screen.getByRole('link', { name: /라이브 2/ })
  expect(within(ended).getByText('종료')).toBeInTheDocument()
  expect(within(ended).queryByText('LIVE')).not.toBeInTheDocument()
})

it('라이브 카드에는 재생 시간이 없고, 썸네일이 없으면 기본 이미지를 보여 준다', async () => {
  useLiveServer()

  renderApp('/')

  const withThumbnail = await screen.findByRole('link', { name: /라이브 3/ })
  expect(withThumbnail.querySelector('img')).toHaveAttribute('src', '/api/broadcasts/3/thumbnail')
  const withoutThumbnail = screen.getByRole('link', { name: /라이브 2/ })
  expect(within(withoutThumbnail).getByLabelText('썸네일 없음')).toBeInTheDocument()
  for (const card of screen.getAllByRole('link', { name: /라이브 \d/ })) {
    expect(within(card).queryByText(/\d\d:\d\d/)).not.toBeInTheDocument()
  }
})

it('녹화방송 카드에는 배지가 없다', async () => {
  server.use(
    http.get('/api/broadcasts', () =>
      HttpResponse.json({
        items: [
          {
            id: 1,
            kind: 'RECORDING',
            title: '녹화 1',
            createdAt: '2026-03-15T12:00:00Z',
            durationSeconds: 60,
            thumbnailUrl: null,
          },
        ],
        hasNext: false,
      }),
    ),
  )

  renderApp('/?kind=RECORDING')

  const card = await screen.findByRole('link', { name: /녹화 1/ })
  expect(within(card).queryByText('LIVE')).not.toBeInTheDocument()
  expect(within(card).queryByText('종료')).not.toBeInTheDocument()
  expect(within(card).getByText('01:00')).toBeInTheDocument()
})

it('라이브 탭은 15초마다 다시 불러오고 녹화방송 탭은 그렇지 않다', async () => {
  const requests: string[] = []
  useLiveServer(requests)
  vi.useFakeTimers({ shouldAdvanceTime: true })

  const { unmount } = renderApp('/?kind=LIVE')
  await screen.findByRole('link', { name: /라이브 3/ })
  expect(requests).toEqual(['?kind=LIVE'])

  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000)
  })
  await waitFor(() => expect(requests.length).toBe(2))
  unmount()

  const recordingRequests: string[] = []
  server.use(
    http.get('/api/broadcasts', ({ request }) => {
      recordingRequests.push(new URL(request.url).search)
      return HttpResponse.json({ items: [], hasNext: false })
    }),
  )
  renderApp('/?kind=RECORDING')
  await screen.findByText('등록된 방송이 없습니다')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000)
  })
  expect(recordingRequests).toEqual(['?kind=RECORDING'])
})

it('창에 초점이 돌아오면 라이브 탭을 바로 갱신한다', async () => {
  const requests: string[] = []
  useLiveServer(requests)

  renderApp('/?kind=LIVE')
  await screen.findByRole('link', { name: /라이브 3/ })
  expect(requests).toHaveLength(1)

  await act(async () => {
    window.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await waitFor(() => expect(requests.length).toBeGreaterThanOrEqual(2))
})

it('라이브 카드는 썸네일 주소를 쓰고, 없으면 기본 이미지를 보여 준다', async () => {
  server.use(
    http.get('/api/broadcasts', () =>
      HttpResponse.json({
        items: [live(2, 'ON_AIR', '/api/broadcasts/2/thumbnail'), live(1, 'ENDED')],
        hasNext: false,
      }),
    ),
  )

  const { container } = renderApp('/?tab=live')

  await screen.findByText('라이브 2')
  expect(container.querySelector('a[href="/broadcasts/2"] img')).toHaveAttribute('src', '/api/broadcasts/2/thumbnail')
  const withoutThumbnail = container.querySelector('a[href="/broadcasts/1"]') as HTMLElement
  expect(within(withoutThumbnail).getByRole('img', { name: '썸네일 없음' })).toBeInTheDocument()
})
