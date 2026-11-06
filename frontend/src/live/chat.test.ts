import { describe, expect, it, vi } from 'vitest'
import type { Comment, CommentPage } from '../api/comments'
import type { ChatChannel, ChatDeps, ChatHandlers } from './chat'
import { RECONNECT_DELAY_MS, createLiveChat } from './chat'
import type { ChatMessage } from './chat-protocol'

function comment(id: number, content = `채팅 ${id}`): Comment {
  return { id, content, author: { id: 1, nickname: '방송러' }, createdAt: '2026-03-15T12:00:00Z' }
}

/** 서버의 댓글 표를 흉내 낸다. 최신순 한 페이지씩 돌려주고, pageSize로 페이지 크기를 정한다. */
function fakeRest(initial: Comment[], pageSize = 50) {
  const store = { comments: [...initial] }
  const fetchPage = vi.fn(async (_id: number, before?: number): Promise<CommentPage> => {
    const sorted = store.comments.filter((c) => before === undefined || c.id < before).sort((a, b) => b.id - a.id)
    const items = sorted.slice(0, pageSize)
    return {
      items,
      nextCursor: sorted.length > pageSize ? items[items.length - 1].id : null,
      totalCount: store.comments.length,
    }
  })
  return { store, fetchPage }
}

function setup(initial: Comment[] = [], options: { pageSize?: number } = {}) {
  const rest = fakeRest(initial, options.pageSize)
  const sockets: { handlers: ChatHandlers; close: ReturnType<typeof vi.fn> }[] = []
  const timers: { callback: () => void; delayMs: number; cancelled: boolean }[] = []
  let openFailure: Error | null = null
  const postComment = vi.fn(async (_id: number, content: string) => {
    const created = comment(Math.max(0, ...rest.store.comments.map((c) => c.id)) + 1, content)
    rest.store.comments.push(created)
    return created
  })
  const deps: ChatDeps = {
    openChat: vi.fn(async (_id: number, handlers: ChatHandlers): Promise<ChatChannel> => {
      if (openFailure) throw openFailure
      const close = vi.fn()
      sockets.push({ handlers, close })
      return { close }
    }),
    fetchPage: rest.fetchPage,
    postComment,
    schedule: (callback, delayMs) => {
      const timer = { callback, delayMs, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
  }
  return {
    deps,
    rest,
    postComment,
    sockets,
    timers,
    failOpening: (error: Error | null) => {
      openFailure = error
    },
    server: {
      push: (message: ChatMessage, index = sockets.length - 1) => sockets[index].handlers.onMessage(message),
      drop: (index = sockets.length - 1) => sockets[index].handlers.onClose(),
    },
    fireTimer: () => {
      const timer = timers.filter((t) => !t.cancelled).at(-1)
      if (!timer) throw new Error('예약된 타이머가 없다')
      timer.cancelled = true
      timer.callback()
    },
  }
}

async function opened(initial: Comment[] = [], options: { pageSize?: number } = {}) {
  const env = setup(initial, options)
  const chat = createLiveChat(env.deps, 7)
  chat.join()
  await vi.waitFor(() => expect(chat.state().phase).toBe('open'))
  return { chat, env }
}

const commentsOf = (state: ReturnType<ReturnType<typeof createLiveChat>['state']>) =>
  state.phase === 'open' || state.phase === 'ended' ? state.comments.map((c) => c.id) : null

describe('채팅 모듈', () => {
  it('join하면 connecting이고 방송 번호로 연결과 최근 채팅을 요청한다', async () => {
    const env = setup([comment(1)])
    const chat = createLiveChat(env.deps, 7)

    chat.join()

    expect(chat.state()).toEqual({ phase: 'connecting' })
    await vi.waitFor(() => expect(chat.state().phase).toBe('open'))
    expect(env.deps.openChat).toHaveBeenCalledWith(7, expect.any(Object))
    expect(env.rest.fetchPage).toHaveBeenCalledWith(7)
  })

  it('최근 한 페이지를 오래된 순으로 쌓고 구독한 채팅을 끝에 붙인다', async () => {
    const { chat, env } = await opened([comment(1), comment(2), comment(3)])
    expect(commentsOf(chat.state())).toEqual([1, 2, 3])

    env.server.push({ type: 'comment', comment: comment(4) })
    env.server.push({ type: 'comment', comment: comment(5) })

    expect(commentsOf(chat.state())).toEqual([1, 2, 3, 4, 5])
  })

  it('같은 id의 채팅은 하나만 남긴다', async () => {
    const { chat, env } = await opened([comment(1)])

    env.server.push({ type: 'comment', comment: comment(2) })
    env.server.push({ type: 'comment', comment: comment(2) })
    env.server.push({ type: 'comment', comment: comment(1) })

    expect(commentsOf(chat.state())).toEqual([1, 2])
  })

  it('목록을 불러오는 동안 받은 채팅도 빠지지 않고 합친다', async () => {
    const env = setup([comment(1), comment(2)])
    let release: () => void = () => {}
    env.deps.fetchPage = vi.fn(
      () =>
        new Promise<CommentPage>((resolve) => {
          release = () => resolve({ items: [comment(2), comment(1)], nextCursor: null, totalCount: 2 })
        }),
    )
    const chat = createLiveChat(env.deps, 7)

    chat.join()
    await vi.waitFor(() => expect(env.sockets).toHaveLength(1))
    env.server.push({ type: 'comment', comment: comment(3) })
    release()
    await vi.waitFor(() => expect(chat.state().phase).toBe('open'))

    expect(commentsOf(chat.state())).toEqual([1, 2, 3])
  })

  it('내가 REST로 쓴 채팅은 바로 보이고 구독으로 같은 채팅이 와도 하나다', async () => {
    const { chat, env } = await opened([comment(1)])

    await chat.send('안녕')
    expect(commentsOf(chat.state())).toEqual([1, 2])
    env.server.push({ type: 'comment', comment: env.rest.store.comments.at(-1)! })

    expect(commentsOf(chat.state())).toEqual([1, 2])
    expect(env.postComment).toHaveBeenCalledWith(7, '안녕')
  })

  it('ended를 받으면 읽기 전용이 되고 채팅 목록을 그대로 둔다', async () => {
    const { chat, env } = await opened([comment(1)])

    env.server.push({ type: 'ended' })
    env.server.push({ type: 'comment', comment: comment(9) })
    env.server.drop()

    expect(chat.state()).toEqual({ phase: 'ended', comments: [comment(1)] })
    expect(env.timers).toHaveLength(0)
  })

  it('종료된 방송은 목록을 불러오기 전에 ended가 와도 목록과 함께 ended가 된다', async () => {
    const env = setup([comment(1), comment(2)])
    const chat = createLiveChat(env.deps, 7)

    chat.join()
    await vi.waitFor(() => expect(env.sockets).toHaveLength(1))
    env.server.push({ type: 'ended' })
    env.server.drop()
    await vi.waitFor(() => expect(chat.state().phase).toBe('ended'))

    expect(commentsOf(chat.state())).toEqual([1, 2])
    expect(env.timers).toHaveLength(0)
  })

  it('연결이 끊기면 몇 초 뒤 다시 연결하고 놓친 채팅을 채운다', async () => {
    const { chat, env } = await opened([comment(1), comment(2)])
    env.server.push({ type: 'comment', comment: comment(3) })

    env.server.drop()
    // 끊긴 동안 쓴 채팅
    env.rest.store.comments.push(comment(4), comment(5))
    expect(chat.state().phase).toBe('open')
    expect(env.timers.at(-1)?.delayMs).toBe(RECONNECT_DELAY_MS)
    env.fireTimer()
    await vi.waitFor(() => expect(env.sockets).toHaveLength(2))
    await vi.waitFor(() => expect(commentsOf(chat.state())).toEqual([1, 2, 3, 4, 5]))

    env.server.push({ type: 'comment', comment: comment(6) })
    expect(commentsOf(chat.state())).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('놓친 채팅이 한 페이지를 넘어도 마지막으로 받은 채팅 뒤까지 이어서 채운다', async () => {
    const { chat, env } = await opened([comment(1), comment(2)], { pageSize: 2 })

    env.server.drop()
    env.rest.store.comments.push(comment(3), comment(4), comment(5), comment(6), comment(7))
    env.fireTimer()

    await vi.waitFor(() => expect(commentsOf(chat.state())).toEqual([1, 2, 3, 4, 5, 6, 7]))
  })

  it('다시 연결하는 중에 연결이 또 실패하면 한 번 더 예약한다', async () => {
    const { chat, env } = await opened([comment(1)])
    env.server.drop()
    env.failOpening(new Error('끊김'))

    env.fireTimer()
    await vi.waitFor(() => expect(env.timers.filter((t) => !t.cancelled)).toHaveLength(1))
    env.failOpening(null)
    env.fireTimer()

    await vi.waitFor(() => expect(env.sockets).toHaveLength(2))
    expect(chat.state().phase).toBe('open')
  })

  it('처음 연결이나 목록 요청이 실패하면 failed이고 join으로 다시 시도한다', async () => {
    const env = setup([comment(1)])
    env.failOpening(new Error('실패'))
    const chat = createLiveChat(env.deps, 7)

    chat.join()
    await vi.waitFor(() => expect(chat.state().phase).toBe('failed'))
    env.failOpening(null)
    chat.join()

    await vi.waitFor(() => expect(chat.state().phase).toBe('open'))
  })

  it('dispose하면 연결과 예약을 정리하고 늦게 온 응답은 무시한다', async () => {
    const { chat, env } = await opened([comment(1)])
    env.server.drop()

    chat.dispose()
    env.timers.forEach((t) => expect(t.cancelled).toBe(true))
    chat.join()
    chat.dispose()

    await vi.waitFor(() => expect(env.sockets[1].close).toHaveBeenCalled())
  })

  it('상태가 바뀌면 구독자에게 알린다', async () => {
    const env = setup([comment(1)])
    const chat = createLiveChat(env.deps, 7)
    const listener = vi.fn()
    chat.subscribe(listener)

    chat.join()
    await vi.waitFor(() => expect(chat.state().phase).toBe('open'))

    expect(listener).toHaveBeenCalled()
  })
})
