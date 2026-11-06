import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'
import { emptyBroadcastList, signedInAs } from '../test/auth'
import { observedElementCount, revealObservedElements } from '../test/intersection'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

beforeEach(() => {
  server.use(
    http.get('/api/broadcasts/upload-policy', () =>
      HttpResponse.json({ maxVideoBytes: 1048576, maxThumbnailBytes: 2097152, maxTitleLength: 100 }),
    ),
  )
})

const owner = { id: 1, nickname: '방송러' }

const recording = {
  id: 12,
  kind: 'RECORDING',
  title: '내 녹화방송',
  createdAt: '2026-03-15T12:00:00Z',
  owner,
  durationSeconds: 125,
  thumbnailUrl: '/api/broadcasts/12/thumbnail',
}
const onAirLive = {
  id: 11,
  kind: 'LIVE',
  title: '내 라이브',
  createdAt: '2026-03-14T12:00:00Z',
  owner,
  thumbnailUrl: null,
  status: 'ON_AIR',
}
const endedLive = { ...onAirLive, id: 10, title: '끝난 라이브', status: 'ENDED' }

function useMine(items: unknown[], hasNext = false) {
  server.use(http.get('/api/me/broadcasts', () => HttpResponse.json({ items, hasNext })))
}

const rowOf = (title: string) => screen.getByRole('row', { name: new RegExp(title) })

it('비로그인이면 로그인 화면으로 보내고 로그인하면 내 방송으로 돌아오도록 next를 싣는다', async () => {
  const { router } = renderApp('/me/broadcasts')

  await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  expect(router.state.location.search).toBe('?next=%2Fme%2Fbroadcasts')
})

it('내 방송 표에 썸네일, 제목, 종류, 상태, 등록일, 관리 버튼이 나온다', async () => {
  signedInAs()
  useMine([recording, onAirLive, endedLive])
  renderApp('/me/broadcasts')

  expect(await screen.findByRole('heading', { name: '내 방송' })).toBeInTheDocument()
  const recordingRow = await screen.findByRole('row', { name: /내 녹화방송/ })
  expect(within(recordingRow).getByRole('link', { name: '내 녹화방송' })).toHaveAttribute(
    'href',
    '/broadcasts/12',
  )
  expect(within(recordingRow).getByText('녹화방송')).toBeInTheDocument()
  expect(within(recordingRow).getByText('2026.03.15', { exact: false })).toBeInTheDocument()
  expect(recordingRow.querySelector('img')).toHaveAttribute('src', '/api/broadcasts/12/thumbnail')
  expect(within(recordingRow).getByRole('button', { name: '제목 수정' })).toBeInTheDocument()
  expect(within(recordingRow).getByRole('button', { name: '삭제' })).toBeInTheDocument()

  const liveRow = rowOf('내 라이브')
  expect(within(liveRow).getByText('라이브')).toBeInTheDocument()
  expect(within(liveRow).getByText('방송 중')).toBeInTheDocument()
  expect(within(rowOf('끝난 라이브')).getByText('종료')).toBeInTheDocument()
})

it('내 방송이 없으면 빈 안내를 보여 준다', async () => {
  signedInAs()
  useMine([])
  renderApp('/me/broadcasts')

  expect(await screen.findByText('아직 올린 방송이 없습니다')).toBeInTheDocument()
})

it('끝까지 내려가면 다음 묶음을 이어 받고 더 없으면 감시를 멈춘다', async () => {
  signedInAs()
  const requested: (string | null)[] = []
  server.use(
    http.get('/api/me/broadcasts', ({ request }) => {
      const before = new URL(request.url).searchParams.get('before')
      requested.push(before)
      return before === null
        ? HttpResponse.json({ items: [recording], hasNext: true })
        : HttpResponse.json({ items: [{ ...endedLive, id: 3, title: '오래된 방송' }], hasNext: false })
    }),
  )
  renderApp('/me/broadcasts')

  await screen.findByRole('row', { name: /내 녹화방송/ })
  revealObservedElements()

  expect(await screen.findByRole('row', { name: /오래된 방송/ })).toBeInTheDocument()
  expect(requested).toEqual([null, '12'])
  await waitFor(() => expect(observedElementCount()).toBe(0))
})

it('제목 수정은 입력창에서 새 제목을 저장하고 표를 새로 받는다', async () => {
  signedInAs()
  let title = '내 녹화방송'
  const patched: unknown[] = []
  server.use(
    http.get('/api/me/broadcasts', () =>
      HttpResponse.json({ items: [{ ...recording, title }], hasNext: false }),
    ),
    http.patch('/api/broadcasts/12', async ({ request }) => {
      const body = (await request.json()) as { title: string }
      patched.push(body)
      title = body.title
      return HttpResponse.json({ ...recording, title, video: {} })
    }),
  )
  const user = userEvent.setup()
  renderApp('/me/broadcasts')

  await user.click(within(await screen.findByRole('row', { name: /내 녹화방송/ })).getByRole('button', { name: '제목 수정' }))
  const dialog = screen.getByRole('dialog', { name: '제목 수정' })
  const input = within(dialog).getByRole('textbox', { name: '제목' })
  expect(input).toHaveValue('내 녹화방송')
  await user.clear(input)
  await user.type(input, '바꾼 제목')
  await user.click(within(dialog).getByRole('button', { name: '저장' }))

  expect(await screen.findByRole('row', { name: /바꾼 제목/ })).toBeInTheDocument()
  expect(patched).toEqual([{ title: '바꾼 제목' }])
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('제목 규칙에 어긋나면 서버에 보내지 않고 이유를 보여 준다', async () => {
  signedInAs()
  useMine([recording])
  let patchCalls = 0
  server.use(
    http.patch('/api/broadcasts/12', () => {
      patchCalls += 1
      return HttpResponse.json({})
    }),
  )
  const user = userEvent.setup()
  renderApp('/me/broadcasts')

  await user.click(within(await screen.findByRole('row', { name: /내 녹화방송/ })).getByRole('button', { name: '제목 수정' }))
  const dialog = screen.getByRole('dialog', { name: '제목 수정' })
  await user.clear(within(dialog).getByRole('textbox', { name: '제목' }))
  await user.click(within(dialog).getByRole('button', { name: '저장' }))

  expect(within(dialog).getByText('제목을 입력하세요')).toBeInTheDocument()
  expect(patchCalls).toBe(0)
})

it('서버가 제목을 거절하면 그 이유를 입력창 옆에 보여 준다', async () => {
  signedInAs()
  useMine([recording])
  server.use(
    http.patch('/api/broadcasts/12', () =>
      HttpResponse.json(
        { status: 400, errors: [{ field: 'title', reason: '제목은 100자 이하로 입력하세요' }] },
        { status: 400 },
      ),
    ),
  )
  const user = userEvent.setup()
  renderApp('/me/broadcasts')

  await user.click(within(await screen.findByRole('row', { name: /내 녹화방송/ })).getByRole('button', { name: '제목 수정' }))
  const dialog = screen.getByRole('dialog', { name: '제목 수정' })
  await user.click(within(dialog).getByRole('button', { name: '저장' }))

  expect(await within(dialog).findByText('제목은 100자 이하로 입력하세요')).toBeInTheDocument()
})

it('삭제는 확인 대화상자에서 확인해야 보내고, 취소하면 아무것도 지우지 않는다', async () => {
  signedInAs()
  let items = [recording, endedLive]
  let deleteCalls = 0
  server.use(
    http.get('/api/me/broadcasts', () => HttpResponse.json({ items, hasNext: false })),
    http.delete('/api/broadcasts/12', () => {
      deleteCalls += 1
      items = items.filter((item) => item.id !== 12)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const user = userEvent.setup()
  renderApp('/me/broadcasts')

  await user.click(within(await screen.findByRole('row', { name: /내 녹화방송/ })).getByRole('button', { name: '삭제' }))
  let dialog = screen.getByRole('dialog', { name: '방송 삭제' })
  expect(within(dialog).getByText(/내 녹화방송/)).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: '취소' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(deleteCalls).toBe(0)

  await user.click(within(rowOf('내 녹화방송')).getByRole('button', { name: '삭제' }))
  dialog = screen.getByRole('dialog', { name: '방송 삭제' })
  await user.click(within(dialog).getByRole('button', { name: '삭제' }))

  await waitFor(() => expect(screen.queryByRole('row', { name: /내 녹화방송/ })).not.toBeInTheDocument())
  expect(deleteCalls).toBe(1)
  expect(screen.getByRole('row', { name: /끝난 라이브/ })).toBeInTheDocument()
})

it('방송 중이라 지울 수 없으면 서버가 알려 준 이유를 대화상자에 보여 준다', async () => {
  signedInAs()
  useMine([onAirLive])
  server.use(
    http.delete('/api/broadcasts/11', () =>
      HttpResponse.json({ status: 409, detail: '방송 중인 라이브방송은 지울 수 없습니다' }, { status: 409 }),
    ),
  )
  const user = userEvent.setup()
  renderApp('/me/broadcasts')

  await user.click(within(await screen.findByRole('row', { name: /내 라이브/ })).getByRole('button', { name: '삭제' }))
  const dialog = screen.getByRole('dialog', { name: '방송 삭제' })
  await user.click(within(dialog).getByRole('button', { name: '삭제' }))

  expect(await within(dialog).findByText('방송 중인 라이브방송은 지울 수 없습니다')).toBeInTheDocument()
  expect(screen.getByRole('row', { name: /내 라이브/ })).toBeInTheDocument()
})

it('프로필 메뉴의 내 방송에서 이 화면으로 온다', async () => {
  signedInAs('방송러')
  emptyBroadcastList()
  useMine([])
  const user = userEvent.setup()
  const { router } = renderApp('/')

  await user.click(await within(screen.getByRole('banner')).findByRole('button', { name: '방송러' }))
  await user.click(screen.getByRole('menuitem', { name: '내 방송' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/me/broadcasts'))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})
