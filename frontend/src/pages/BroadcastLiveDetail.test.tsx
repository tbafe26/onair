import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

function liveDetail(status: 'ON_AIR' | 'ENDED', endedAt: string | null) {
  return {
    id: 5,
    kind: 'LIVE',
    title: '상세 라이브',
    createdAt: '2026-03-15T12:00:00Z',
    thumbnailUrl: null,
    status,
    endedAt,
  }
}

function useLive(status: 'ON_AIR' | 'ENDED', endedAt: string | null) {
  server.use(
    http.get('/api/broadcasts/5', () => HttpResponse.json(liveDetail(status, endedAt))),
    http.get('/api/broadcasts', () =>
      HttpResponse.json({
        items: [
          {
            id: 6,
            kind: 'LIVE',
            title: '다른 라이브',
            createdAt: '2026-03-15T12:00:00Z',
            thumbnailUrl: null,
            status: 'ON_AIR',
          },
          {
            id: 4,
            kind: 'RECORDING',
            title: '다른 녹화',
            createdAt: '2026-03-14T12:00:00Z',
            durationSeconds: 30,
            thumbnailUrl: null,
          },
        ],
        hasNext: false,
      }),
    ),
  )
}

it('방송 중인 라이브방송은 상태, 제목, 시작 시각을 보여 주고 종료 시각과 녹화 플레이어는 없다', async () => {
  useLive('ON_AIR', null)

  renderApp('/broadcasts/5')

  expect(await screen.findByRole('heading', { name: '상세 라이브' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('방송 중')
  expect(screen.getByText(/^시작/)).toHaveTextContent('2026.03.15')
  expect(screen.queryByText(/^종료/)).not.toBeInTheDocument()
  expect(screen.queryByText('방송이 종료되었습니다')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('영상 플레이어')).not.toBeInTheDocument()
})

it('종료된 라이브방송은 종료 문구와 시작·종료 시각을 보여 준다', async () => {
  useLive('ENDED', '2026-03-15T13:30:00Z')

  renderApp('/broadcasts/5')

  expect(await screen.findByText('방송이 종료되었습니다')).toBeInTheDocument()
  expect(screen.getByText(/^시작/)).toBeInTheDocument()
  expect(screen.getByText(/^종료/)).toBeInTheDocument()
})

it('라이브방송 상세에도 다른 방송 패널이 있다', async () => {
  useLive('ON_AIR', null)

  renderApp('/broadcasts/5')

  const panel = await screen.findByRole('complementary', { name: '방송 더보기' })
  expect(await within(panel).findByRole('link', { name: /다른 라이브/ })).toHaveAttribute(
    'href',
    '/broadcasts/6',
  )
  expect(within(panel).getByRole('link', { name: /다른 녹화/ })).toHaveAttribute(
    'href',
    '/broadcasts/4',
  )
})
