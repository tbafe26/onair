import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

function detailResponse(id: number, title: string, thumbnailUrl: string | null) {
  return {
    id,
    kind: 'RECORDING',
    title,
    createdAt: '2026-03-15T12:00:00Z',
    owner: { id: 1, nickname: '방송러' },
    video: {
      url: `/api/broadcasts/${id}/video`,
      contentType: 'video/webm',
      sizeBytes: 100,
      durationSeconds: 10,
      thumbnailUrl,
    },
  }
}

function summary(id: number, title: string, thumbnailUrl: string | null) {
  return {
    id,
    kind: 'RECORDING',
    title,
    createdAt: '2026-02-01T12:00:00Z',
    owner: { id: 1, nickname: '방송러' },
    durationSeconds: 60,
    thumbnailUrl,
  }
}

function useDetail(thumbnailUrl: string | null = '/api/broadcasts/7/thumbnail') {
  server.use(
    http.get('/api/broadcasts/7', () => HttpResponse.json(detailResponse(7, '상세 방송', thumbnailUrl))),
    http.get('/api/broadcasts', () =>
      HttpResponse.json({
        items: [
          summary(8, '다른 방송', '/api/broadcasts/8/thumbnail'),
          summary(7, '상세 방송', thumbnailUrl),
          summary(6, '옛날 방송', null),
        ],
        hasNext: false,
      }),
    ),
  )
}

it('방송 상세에 제목과 등록 일시를 보여 준다', async () => {
  useDetail()

  renderApp('/broadcasts/7')

  expect(await screen.findByRole('heading', { name: '상세 방송' })).toBeInTheDocument()
  expect(screen.getByText(/2026\.03\.15/)).toBeInTheDocument()
})

it('플레이어에 영상 주소와 형식을 소스로, 썸네일을 포스터로 설정한다', async () => {
  useDetail()

  renderApp('/broadcasts/7')

  const video = await screen.findByLabelText('영상 플레이어')
  expect(video.tagName).toBe('VIDEO')
  expect(video).toHaveAttribute('controls')
  expect(video).toHaveAttribute('poster', '/api/broadcasts/7/thumbnail')
  const source = video.querySelector('source')
  expect(source).toHaveAttribute('src', '/api/broadcasts/7/video')
  expect(source).toHaveAttribute('type', 'video/webm')
})

it('썸네일이 없으면 포스터를 설정하지 않는다', async () => {
  useDetail(null)

  renderApp('/broadcasts/7')

  const video = await screen.findByLabelText('영상 플레이어')
  expect(video).not.toHaveAttribute('poster')
})

it('"방송 더보기"에서 현재 방송을 빼고 다른 방송으로 연결한다', async () => {
  useDetail()

  renderApp('/broadcasts/7')

  const panel = await screen.findByRole('complementary', { name: '방송 더보기' })
  expect(await within(panel).findByRole('link', { name: /다른 방송/ })).toHaveAttribute(
    'href',
    '/broadcasts/8',
  )
  expect(within(panel).getByRole('link', { name: /옛날 방송/ })).toHaveAttribute(
    'href',
    '/broadcasts/6',
  )
  expect(within(panel).queryByText('상세 방송')).not.toBeInTheDocument()
})

it('"방송 더보기"에서 썸네일이 없는 방송은 자리표시를 보여 준다', async () => {
  useDetail()

  renderApp('/broadcasts/7')

  const panel = await screen.findByRole('complementary', { name: '방송 더보기' })
  const old = await within(panel).findByRole('link', { name: /옛날 방송/ })
  expect(within(old).getByRole('img', { name: '썸네일 없음' })).toBeInTheDocument()
  const other = within(panel).getByRole('link', { name: /다른 방송/ })
  expect(within(other).queryByRole('img', { name: '썸네일 없음' })).not.toBeInTheDocument()
})

it('영상을 재생할 수 없으면 플레이어 자리에 오류 안내를 보여 준다', async () => {
  useDetail()

  renderApp('/broadcasts/7')

  const video = await screen.findByLabelText('영상 플레이어')
  fireEvent.error(video.querySelector('source')!)

  expect(await screen.findByText('영상을 재생할 수 없습니다')).toBeInTheDocument()
  expect(screen.queryByLabelText('영상 플레이어')).not.toBeInTheDocument()
})

it('없는 방송이면 안내와 목록으로 돌아가는 버튼을 보여 준다', async () => {
  server.use(
    http.get('/api/broadcasts/999', () => new HttpResponse(null, { status: 404 })),
  )

  renderApp('/broadcasts/999')

  expect(await screen.findByText('방송을 찾을 수 없습니다')).toBeInTheDocument()
  expect(
    within(screen.getByRole('main')).getByRole('link', { name: '목록으로 돌아가기' }),
  ).toHaveAttribute('href', '/')
})

it('방송 상세에 소유자 닉네임을 보여 준다', async () => {
  server.use(
    http.get('/api/broadcasts/7', () =>
      HttpResponse.json({ ...detailResponse(7, '상세 방송', null), owner: { id: 9, nickname: '채널주인' } }),
    ),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )

  renderApp('/broadcasts/7')

  await screen.findByRole('heading', { name: '상세 방송' })
  expect(screen.getByText('채널주인')).toBeInTheDocument()
})
