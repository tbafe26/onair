import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import type { Comment } from '../api/comments'
import type { ChatState } from '../live/chat'
import { signedInAs } from '../test/auth'
import { fakeStream } from '../test/fakeLive'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

// 화면 테스트는 가짜 채팅 모듈의 상태를 직접 바꿔 패널만 확인한다. 연결과 재연결은 live/chat.test.ts가 맡는다.
type App = ReturnType<typeof renderApp>

function comment(id: number, content: string, nickname = '시청자'): Comment {
  return { id, content, author: { id: id + 100, nickname }, createdAt: '2026-03-15T12:00:00Z' }
}

function setChat(app: App, state: ChatState) {
  act(() => app.fake.chat.setState(state))
}

function stubLive(status: 'ON_AIR' | 'ENDED' = 'ON_AIR') {
  server.use(
    http.get('/api/broadcasts/5', () =>
      HttpResponse.json({
        id: 5,
        kind: 'LIVE',
        title: '채팅 라이브',
        createdAt: '2026-03-15T12:00:00Z',
        owner: { id: 9, nickname: '소유자닉' },
        thumbnailUrl: null,
        status,
        endedAt: status === 'ENDED' ? '2026-03-15T13:00:00Z' : null,
      }),
    ),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )
}

async function openPanel(state: ChatState = { phase: 'open', comments: [], donations: [] }, status: 'ON_AIR' | 'ENDED' = 'ON_AIR') {
  stubLive(status)
  const app = renderApp('/broadcasts/5')
  const panel = await screen.findByRole('region', { name: '채팅' })
  setChat(app, state)
  return { app, panel }
}

it('라이브 상세에 채팅 패널이 있고 그 방송의 채팅 모듈을 연결한다', async () => {
  const { app, panel } = await openPanel({ phase: 'open', comments: [comment(1, '첫 채팅'), comment(2, '둘째')], donations: [] })

  expect(app.fake.createChat).toHaveBeenCalledWith(5)
  expect(app.fake.chat.join).toHaveBeenCalledTimes(1)
  const rows = within(within(panel).getByRole('list', { name: '채팅 목록' })).getAllByRole('listitem')
  expect(rows.map((row) => row.textContent)).toEqual(['시청자첫 채팅', '시청자둘째'])
})

it('"방송 더보기"는 채팅 아래에 있다', async () => {
  await openPanel()

  const chat = screen.getByRole('region', { name: '채팅' })
  const more = await screen.findByRole('complementary', { name: '방송 더보기' })

  expect(chat.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('채팅이 없으면 안내를 보여 주고 연결 중이거나 실패하면 그 상태를 보여 준다', async () => {
  const { app, panel } = await openPanel({ phase: 'connecting' })
  expect(within(panel).getByText('채팅을 불러오는 중...')).toBeInTheDocument()

  setChat(app, { phase: 'open', comments: [], donations: [] })
  expect(within(panel).getByText('아직 채팅이 없습니다')).toBeInTheDocument()

  setChat(app, { phase: 'failed', message: '채팅을 불러오지 못했습니다.' })
  await userEvent.click(within(panel).getByRole('button', { name: '다시 시도' }))
  expect(app.fake.chat.join).toHaveBeenCalledTimes(2)
})

it('채팅 내용의 HTML은 글자 그대로 보인다', async () => {
  const { panel } = await openPanel({ phase: 'open', comments: [comment(1, '<b>굵게</b><script>x()</script>')], donations: [] })

  expect(within(panel).getByText('<b>굵게</b><script>x()</script>')).toBeInTheDocument()
  expect(panel.querySelector('b, script')).toBeNull()
})

it('비로그인에게는 입력창 대신 로그인 안내와 링크를 보여 준다', async () => {
  const { panel } = await openPanel()

  expect(within(panel).getByText(/로그인 후 채팅에 참여할 수 있습니다/)).toBeInTheDocument()
  expect(within(panel).getByRole('link', { name: '로그인' })).toHaveAttribute(
    'href',
    '/login?next=%2Fbroadcasts%2F5',
  )
  expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument()
})

it('로그인한 사용자는 Enter로 채팅을 보내고 입력창이 비워진다', async () => {
  signedInAs()
  const { app, panel } = await openPanel()
  const input = await within(panel).findByRole('textbox', { name: '채팅 입력' })

  await userEvent.type(input, '  안녕하세요  {Enter}')

  expect(app.fake.chat.send).toHaveBeenCalledWith('안녕하세요')
  await waitFor(() => expect(input).toHaveValue(''))
})

it('보내기 버튼으로도 채팅을 보내고 빈 입력이면 누를 수 없다', async () => {
  signedInAs()
  const { app, panel } = await openPanel()
  const input = await within(panel).findByRole('textbox', { name: '채팅 입력' })
  const send = within(panel).getByRole('button', { name: '보내기' })
  expect(send).toBeDisabled()

  await userEvent.type(input, '안녕하세요')
  await userEvent.click(send)

  expect(app.fake.chat.send).toHaveBeenCalledWith('안녕하세요')
  await waitFor(() => expect(input).toHaveValue(''))
})

it('Shift+Enter는 보내지 않고 줄을 바꾼다', async () => {
  signedInAs()
  const { app, panel } = await openPanel()
  const input = await within(panel).findByRole('textbox', { name: '채팅 입력' })

  await userEvent.type(input, '첫 줄{Shift>}{Enter}{/Shift}둘째 줄')

  expect(input).toHaveValue('첫 줄\n둘째 줄')
  expect(app.fake.chat.send).not.toHaveBeenCalled()
})

it('빈 입력은 보내지 않는다', async () => {
  signedInAs()
  const { app, panel } = await openPanel()
  const input = await within(panel).findByRole('textbox', { name: '채팅 입력' })

  await userEvent.type(input, '   {Enter}')

  expect(app.fake.chat.send).not.toHaveBeenCalled()
})

it('보내지 못하면 입력을 남기고 안내를 보여 준다', async () => {
  signedInAs()
  const { app, panel } = await openPanel()
  app.fake.chat.send.mockRejectedValueOnce(new Error('실패'))
  const input = await within(panel).findByRole('textbox', { name: '채팅 입력' })

  await userEvent.type(input, '다시{Enter}')

  expect(await within(panel).findByRole('alert')).toHaveTextContent('채팅을 보내지 못했습니다')
  expect(input).toHaveValue('다시')
})

it('방송이 끝나면 입력창 대신 "채팅이 종료되었습니다"를 보여 주고 채팅은 그대로 읽을 수 있다', async () => {
  signedInAs()
  const { app, panel } = await openPanel({ phase: 'open', comments: [comment(1, '남은 채팅')], donations: [] })
  await within(panel).findByRole('textbox', { name: '채팅 입력' })

  setChat(app, { phase: 'ended', comments: [comment(1, '남은 채팅')], donations: [] })

  expect(within(panel).getByText('채팅이 종료되었습니다')).toBeInTheDocument()
  expect(within(panel).queryByRole('textbox')).not.toBeInTheDocument()
  expect(within(panel).getByText('남은 채팅')).toBeInTheDocument()
})

it('비로그인이어도 종료된 방송에서는 "채팅이 종료되었습니다"를 보여 준다', async () => {
  const { panel } = await openPanel({ phase: 'ended', comments: [], donations: [] })

  expect(within(panel).getByText('채팅이 종료되었습니다')).toBeInTheDocument()
  expect(within(panel).queryByText(/로그인 후 채팅/)).not.toBeInTheDocument()
})

it('종료된 라이브방송의 상세에서도 채팅을 읽을 수 있다', async () => {
  const { app, panel } = await openPanel({ phase: 'ended', comments: [comment(1, '지난 채팅')], donations: [] }, 'ENDED')

  expect(app.fake.createChat).toHaveBeenCalledWith(5)
  expect(app.fake.createViewer).not.toHaveBeenCalled()
  expect(within(panel).getByText('지난 채팅')).toBeInTheDocument()
})

it('시청자 상한으로 영상을 볼 수 없어도 채팅은 보고 쓸 수 있다', async () => {
  signedInAs()
  const { app, panel } = await openPanel()

  act(() => app.fake.viewer.setState({ phase: 'full' }))

  expect(await screen.findByText('시청자가 많아 지금은 볼 수 없습니다')).toBeInTheDocument()
  expect(await within(panel).findByRole('textbox', { name: '채팅 입력' })).toBeEnabled()
})

it('맨 아래에 있으면 새 채팅을 따라 내려가고 위로 올려 읽는 동안에는 끌려가지 않는다', async () => {
  const { app, panel } = await openPanel({ phase: 'open', comments: [comment(1, '하나')], donations: [] })
  const list = within(panel).getByTestId('chat-scroll')
  let scrollTop = 0
  Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => scrollTop, set: (v: number) => (scrollTop = v) })
  Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1000 })
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 200 })

  // 맨 아래(800)에 있다고 알린 뒤 새 채팅이 오면 맨 아래로 따라간다.
  scrollTop = 800
  act(() => list.dispatchEvent(new Event('scroll')))
  setChat(app, { phase: 'open', comments: [comment(1, '하나'), comment(2, '둘')], donations: [] })
  expect(scrollTop).toBe(1000)

  // 위로 올려 읽으면 새 채팅이 와도 그대로 둔다.
  scrollTop = 100
  act(() => list.dispatchEvent(new Event('scroll')))
  setChat(app, { phase: 'open', comments: [comment(1, '하나'), comment(2, '둘'), comment(3, '셋')], donations: [] })
  expect(scrollTop).toBe(100)
})

it('송출 화면의 채팅은 송출 중에만 있고 미리보기와 따로 놓인다', async () => {
  signedInAs()
  const app = renderApp('/broadcasts/live/new')
  expect(screen.queryByRole('region', { name: '채팅' })).not.toBeInTheDocument()

  act(() =>
    app.fake.broadcaster.setState({
      phase: 'onAir',
      stream: fakeStream(),
      broadcastId: 7,
      startedAt: Date.now(),
      viewerCount: 0,
      maxViewers: 5,
    }),
  )
  setChat(app, { phase: 'open', comments: [comment(1, '시청자 인사')], donations: [] })

  const panel = await screen.findByRole('region', { name: '채팅' })
  expect(app.fake.createChat).toHaveBeenCalledWith(7)
  expect(within(panel).getByText('시청자 인사')).toBeInTheDocument()
  expect(await within(panel).findByRole('textbox', { name: '채팅 입력' })).toBeInTheDocument()
  // 미리보기를 감싸는 요소 안에 채팅이 들어가지 않는다.
  expect(screen.getByLabelText('카메라 미리보기').parentElement).not.toContainElement(panel)
})

it('후원은 닉네임과 금액과 메시지가 있는 줄로 채팅 사이에 시간 순으로 보인다', async () => {
  const donation = {
    id: 3,
    amount: 5_000,
    message: '<b>힘내세요</b>',
    donor: { id: 3, nickname: '후원자A' },
    confirmedAt: '2026-03-15T12:00:30Z',
    total: { amount: 5_000, count: 1 },
  }
  const { panel } = await openPanel({
    phase: 'open',
    comments: [comment(1, '먼저'), { ...comment(2, '나중'), createdAt: '2026-03-15T12:01:00Z' }],
    donations: [donation],
  })

  const rows = within(within(panel).getByRole('list', { name: '채팅 목록' })).getAllByRole('listitem')
  expect(rows.map((row) => row.textContent)).toEqual(['시청자먼저', '후원자A5,000원<b>힘내세요</b>', '시청자나중'])
  expect(within(rows[1]).getByText('5,000원')).toHaveClass('rounded-full')
  expect(within(rows[1]).getByText('후원자A')).toBeInTheDocument()
  expect(rows[1].querySelector('b')).toBeNull()
  expect(rows[1]).toHaveAttribute('data-donation')
  expect(rows[0]).not.toHaveAttribute('data-donation')
})

it('메시지 없는 후원도 줄로 보이고 후원만 있어도 빈 채팅 안내를 보이지 않는다', async () => {
  const { panel } = await openPanel({
    phase: 'open',
    comments: [],
    donations: [
      {
        id: 3,
        amount: 1_000,
        message: null,
        donor: { id: 3, nickname: '후원자A' },
        confirmedAt: '2026-03-15T12:00:30Z',
        total: { amount: 1_000, count: 1 },
      },
    ],
  })

  expect(within(panel).queryByText('아직 채팅이 없습니다')).not.toBeInTheDocument()
  expect(within(panel).getByText('후원자A')).toBeInTheDocument()
  expect(within(panel).getByText('1,000원')).toBeInTheDocument()
})
