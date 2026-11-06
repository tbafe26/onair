import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'
import { emptyBroadcastList, signedInAs } from '../test/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

beforeEach(() => {
  server.use(
    http.get('/api/broadcasts/upload-policy', () =>
      HttpResponse.json({ maxVideoBytes: 1048576, maxThumbnailBytes: 2097152, maxTitleLength: 100 }),
    ),
  )
})

function detail(ownerId: number, title = '상세 방송') {
  return {
    id: 7,
    kind: 'RECORDING',
    title,
    createdAt: '2026-03-15T12:00:00Z',
    owner: { id: ownerId, nickname: ownerId === 1 ? '방송러' : '다른 사람' },
    video: {
      url: '/api/broadcasts/7/video',
      contentType: 'video/webm',
      sizeBytes: 100,
      durationSeconds: 10,
      thumbnailUrl: null,
    },
  }
}

function useDetail(ownerId: number) {
  server.use(
    http.get('/api/broadcasts/7', () => HttpResponse.json(detail(ownerId))),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )
}

it('소유자의 상세에는 제목 수정과 삭제 버튼이 있다', async () => {
  signedInAs()
  useDetail(1)
  renderApp('/broadcasts/7')

  expect(await screen.findByRole('button', { name: '제목 수정' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
})

it('다른 사람의 방송에는 버튼이 없다', async () => {
  signedInAs()
  useDetail(2)
  renderApp('/broadcasts/7')

  await screen.findByRole('heading', { name: '상세 방송' })
  expect(screen.queryByRole('button', { name: '제목 수정' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
})

it('비로그인 상태에는 소유자의 방송이어도 버튼이 없다', async () => {
  useDetail(1)
  renderApp('/broadcasts/7')

  await screen.findByRole('heading', { name: '상세 방송' })
  expect(screen.queryByRole('button', { name: '제목 수정' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
})

it('제목 수정을 저장하면 상세의 제목이 바뀐다', async () => {
  signedInAs()
  let title = '상세 방송'
  server.use(
    http.get('/api/broadcasts/7', () => HttpResponse.json(detail(1, title))),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
    http.patch('/api/broadcasts/7', async ({ request }) => {
      title = ((await request.json()) as { title: string }).title
      return HttpResponse.json(detail(1, title))
    }),
  )
  const user = userEvent.setup()
  renderApp('/broadcasts/7')

  await user.click(await screen.findByRole('button', { name: '제목 수정' }))
  const dialog = screen.getByRole('dialog', { name: '제목 수정' })
  const input = within(dialog).getByRole('textbox', { name: '제목' })
  await user.clear(input)
  await user.type(input, '새 제목')
  await user.click(within(dialog).getByRole('button', { name: '저장' }))

  expect(await screen.findByRole('heading', { name: '새 제목' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('삭제를 확인하면 목록으로 이동한다', async () => {
  signedInAs()
  useDetail(1)
  emptyBroadcastList()
  let deleted = false
  server.use(
    http.delete('/api/broadcasts/7', () => {
      deleted = true
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const user = userEvent.setup()
  const { router } = renderApp('/broadcasts/7')

  await user.click(await screen.findByRole('button', { name: '삭제' }))
  const dialog = screen.getByRole('dialog', { name: '방송 삭제' })
  await user.click(within(dialog).getByRole('button', { name: '삭제' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  expect(deleted).toBe(true)
})

it('삭제 확인을 취소하면 상세에 그대로 있다', async () => {
  signedInAs()
  useDetail(1)
  const user = userEvent.setup()
  const { router } = renderApp('/broadcasts/7')

  await user.click(await screen.findByRole('button', { name: '삭제' }))
  await user.click(within(screen.getByRole('dialog', { name: '방송 삭제' })).getByRole('button', { name: '취소' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/broadcasts/7')
})
