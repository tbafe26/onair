import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'
import { signedInAs } from '../test/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

interface FakeComment {
  id: number
  content: string
  author: { id: number; nickname: string }
  createdAt: string
}

const ME = { id: 1, nickname: '방송러' }
const OTHER = { id: 2, nickname: '다른 사람' }

function comment(id: number, content: string, author = OTHER): FakeComment {
  return { id, content, author, createdAt: '2026-03-15T12:00:00Z' }
}

/** 서버의 댓글 표를 흉내 낸다. id가 큰 것이 최신이고, size는 요청 값을 따른다. */
function fakeServer(initial: FakeComment[]) {
  const store = { comments: [...initial], requests: [] as string[], posted: [] as string[], deleted: [] as number[] }
  server.use(
    http.get('/api/broadcasts/7', () =>
      HttpResponse.json({
        id: 7,
        kind: 'RECORDING',
        title: '상세 방송',
        createdAt: '2026-03-15T12:00:00Z',
        owner: { id: 9, nickname: '소유자닉' },
        video: {
          url: '/api/broadcasts/7/video',
          contentType: 'video/webm',
          sizeBytes: 100,
          durationSeconds: 10,
          thumbnailUrl: null,
        },
      }),
    ),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
    http.get('/api/broadcasts/7/comments', ({ request }) => {
      const url = new URL(request.url)
      store.requests.push(url.search)
      const before = Number(url.searchParams.get('before') ?? Infinity)
      const size = Number(url.searchParams.get('size') ?? 2)
      const sorted = store.comments.filter((c) => c.id < before).sort((a, b) => b.id - a.id)
      const items = sorted.slice(0, size)
      return HttpResponse.json({
        items,
        nextCursor: sorted.length > size ? items[items.length - 1].id : null,
        totalCount: store.comments.length,
      })
    }),
    http.post('/api/broadcasts/7/comments', async ({ request }) => {
      const { content } = (await request.json()) as { content: string }
      store.posted.push(content)
      const created = comment(100 + store.posted.length, content.trim(), ME)
      store.comments.push(created)
      return HttpResponse.json(created, { status: 201 })
    }),
    http.delete('/api/broadcasts/7/comments/:commentId', ({ params }) => {
      const id = Number(params.commentId)
      store.deleted.push(id)
      store.comments = store.comments.filter((c) => c.id !== id)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return store
}

beforeEach(() => {
  server.use(http.get('/api/broadcasts/upload-policy', () => HttpResponse.json({})))
})

it('댓글 수와 댓글을 최신순으로 보여 주고 HTML은 글자 그대로 보인다', async () => {
  fakeServer([comment(1, '첫 글'), comment(2, '<b>굵게</b><script>alert(1)</script>')])
  renderApp('/broadcasts/7')

  expect(await screen.findByRole('heading', { name: '댓글 2개' })).toBeInTheDocument()
  const items = within(screen.getByRole('list', { name: '댓글' })).getAllByRole('listitem')
  expect(items[0]).toHaveTextContent('<b>굵게</b><script>alert(1)</script>')
  expect(items[1]).toHaveTextContent('첫 글')
  expect(items[0]).toHaveTextContent('다른 사람')
  expect(items[0].querySelector('b, script')).toBeNull()
})

it('비로그인이면 입력창 대신 로그인 안내와 링크가 보인다', async () => {
  fakeServer([comment(1, '첫 글')])
  renderApp('/broadcasts/7')

  await screen.findByRole('heading', { name: '댓글 1개' })
  const section = screen.getByRole('region', { name: '댓글 1개' })
  expect(within(section).getByText(/로그인 후 댓글을 쓸 수 있습니다/)).toBeInTheDocument()
  expect(within(section).getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login?next=%2Fbroadcasts%2F7')
  expect(screen.queryByRole('textbox', { name: '댓글' })).not.toBeInTheDocument()
})

it('댓글을 쓰면 남은 글자 수가 줄고, 등록하면 목록 맨 위에 보이며 입력창이 비워진다', async () => {
  signedInAs()
  const store = fakeServer([comment(1, '첫 글')])
  const user = userEvent.setup()
  renderApp('/broadcasts/7')

  const input = await screen.findByRole('textbox', { name: '댓글' })
  expect(screen.getByText('300자 남음')).toBeInTheDocument()
  await user.type(input, '안녕하세요')
  expect(screen.getByText('295자 남음')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '등록' }))

  expect(await screen.findByRole('heading', { name: '댓글 2개' })).toBeInTheDocument()
  expect(store.posted).toEqual(['안녕하세요'])
  const items = within(screen.getByRole('list', { name: '댓글' })).getAllByRole('listitem')
  expect(items[0]).toHaveTextContent('안녕하세요')
  expect(input).toHaveValue('')
})

it('빈 내용은 보내지 않고, 300자를 넘으면 등록할 수 없다', async () => {
  signedInAs()
  const store = fakeServer([])
  const user = userEvent.setup()
  renderApp('/broadcasts/7')

  const input = await screen.findByRole('textbox', { name: '댓글' })
  expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
  await user.type(input, '   ')
  expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
  await user.clear(input)
  await user.click(input)
  await user.paste('가'.repeat(301))
  expect(screen.getByText('1자 초과')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
  expect(store.posted).toEqual([])
})

it('내 댓글에만 삭제가 있고, 확인하면 지워진다', async () => {
  signedInAs()
  const store = fakeServer([comment(1, '남의 글'), comment(2, '내 글', ME)])
  const user = userEvent.setup()
  renderApp('/broadcasts/7')

  await screen.findByRole('heading', { name: '댓글 2개' })
  const items = within(screen.getByRole('list', { name: '댓글' })).getAllByRole('listitem')
  expect(within(items[1]).queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  await user.click(within(items[0]).getByRole('button', { name: '삭제' }))

  // 확인하기 전에는 지우지 않는다.
  const dialog = screen.getByRole('dialog', { name: '댓글 삭제' })
  expect(store.deleted).toEqual([])
  await user.click(within(dialog).getByRole('button', { name: '삭제' }))

  expect(await screen.findByRole('heading', { name: '댓글 1개' })).toBeInTheDocument()
  expect(store.deleted).toEqual([2])
  expect(screen.queryByText('내 글')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('삭제 확인에서 취소하면 지우지 않는다', async () => {
  signedInAs()
  const store = fakeServer([comment(2, '내 글', ME)])
  const user = userEvent.setup()
  renderApp('/broadcasts/7')

  await user.click(await screen.findByRole('button', { name: '삭제' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))

  expect(store.deleted).toEqual([])
  expect(screen.getByText('내 글')).toBeInTheDocument()
})

it('더 불러오기를 누르면 이어서 오래된 댓글을 받고, 더 없으면 버튼이 사라진다', async () => {
  const store = fakeServer([comment(1, '글 1'), comment(2, '글 2'), comment(3, '글 3')])
  const user = userEvent.setup()
  renderApp('/broadcasts/7')

  await screen.findByRole('heading', { name: '댓글 3개' })
  expect(screen.queryByText('글 1')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '댓글 더 보기' }))

  expect(await screen.findByText('글 1')).toBeInTheDocument()
  await waitFor(() => expect(store.requests).toHaveLength(2))
  expect(store.requests[1]).toContain('before=2')
  expect(screen.queryByRole('button', { name: '댓글 더 보기' })).not.toBeInTheDocument()
})
