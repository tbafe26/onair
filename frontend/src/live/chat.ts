// 채팅 모듈. React와 무관하고, WebSocket 열기와 REST 호출은 바깥에서 받는다(deps).
// 서버는 놓친 메시지를 보관하지 않으므로, 다시 연결하면 REST로 놓친 채팅을 채운 뒤 구독을 잇는다.
import type { Comment, CommentPage } from '../api/comments'
import type { ChatDonation, ChatMessage } from './chat-protocol'

export type ChatState =
  | { phase: 'connecting' }
  /**
   * comments는 오래된 순이다. 연결이 끊겨 다시 연결하는 동안에도 open으로 남는다.
   * donations는 이 화면이 열려 있는 동안 채팅으로 받은 확정 후원이고 id 순(오래된 순)이다.
   */
  | { phase: 'open'; comments: Comment[]; donations: ChatDonation[] }
  /** 방송이 끝났다. 쓸 수 없고 읽기만 한다. */
  | { phase: 'ended'; comments: Comment[]; donations: ChatDonation[] }
  | { phase: 'failed'; message: string }

export interface ChatChannel {
  close(): void
}

export interface ChatHandlers {
  onMessage(message: ChatMessage): void
  /** 서버가 닫았거나 연결이 끊겼다. close()를 직접 부른 경우에는 호출하지 않는다. */
  onClose(): void
}

export interface ChatDeps {
  openChat(broadcastId: number, handlers: ChatHandlers): Promise<ChatChannel>
  /** 최신순 한 페이지. before가 없으면 가장 최근 페이지다. */
  fetchPage(broadcastId: number, before?: number): Promise<CommentPage>
  postComment(broadcastId: number, content: string): Promise<Comment>
  /** 일정 시간 뒤에 callback을 부른다. 돌려주는 함수로 취소한다. 없으면 setTimeout을 쓴다. */
  schedule?: (callback: () => void, delayMs: number) => () => void
}

export const RECONNECT_DELAY_MS = 3000
export const CHAT_LOAD_FAILURE_MESSAGE = '채팅을 불러오지 못했습니다.'

/** 화면이 오래 열려 있어도 메모리가 불어나지 않도록 가장 최근 채팅만 이만큼 둔다. */
const MAX_KEPT_COMMENTS = 500
/** 다시 연결할 때 놓친 채팅을 이어 받는 페이지 수의 상한. */
const MAX_BACKFILL_PAGES = 10

function defaultSchedule(callback: () => void, delayMs: number) {
  const timer = setTimeout(callback, delayMs)
  return () => clearTimeout(timer)
}

/** 같은 id는 먼저 있던 것을 남기고, id 순(오래된 순)으로 정렬해 최근 것만 둔다. */
function merge<T extends { id: number }>(existing: T[], incoming: T[]): T[] {
  const known = new Set(existing.map((comment) => comment.id))
  const added = incoming.filter((item) => !known.has(item.id) && known.add(item.id))
  if (added.length === 0) return existing
  return [...existing, ...added].sort((a, b) => a.id - b.id).slice(-MAX_KEPT_COMMENTS)
}

export interface LiveChat {
  state(): ChatState
  subscribe(listener: () => void): () => void
  /** 채팅을 시작한다. dispose나 failed 뒤에 다시 부르면 처음부터 다시 연결한다. */
  join(): void
  /** 채팅을 REST로 쓴다. 실패하면 던진다. 쓴 채팅은 목록에 바로 반영한다. */
  send(content: string): Promise<void>
  /** 화면을 떠난다. 연결과 예약을 정리한다. */
  dispose(): void
}

/** 연결 하나의 상태. 연결이 바뀌면 새로 만든다. */
interface Connection {
  loaded: boolean
  /** 목록을 채우는 동안 구독으로 먼저 도착한 채팅. */
  buffered: Comment[]
  bufferedDonations: ChatDonation[]
  endedEarly: boolean
}

export function createLiveChat(deps: ChatDeps, broadcastId: number): LiveChat {
  let current: ChatState = { phase: 'connecting' }
  let comments: Comment[] = []
  let donations: ChatDonation[] = []
  let everLoaded = false
  // join, dispose, 연결 끊김마다 올린다. 늦게 도착한 콜백이 이미 정리된 연결을 건드리지 않게 거른다.
  let generation = 0
  let channel: ChatChannel | null = null
  let cancelRetry: (() => void) | null = null
  const listeners = new Set<() => void>()
  const schedule = deps.schedule ?? defaultSchedule

  function set(next: ChatState) {
    current = next
    listeners.forEach((listener) => listener())
  }

  function teardown() {
    cancelRetry?.()
    cancelRetry = null
    const open = channel
    channel = null
    open?.close()
  }

  const fetchFirst = () => deps.fetchPage(broadcastId)

  /** 이번 연결에서 목록에 더할 채팅. 처음이면 최근 한 페이지, 다시 연결이면 마지막으로 받은 채팅 뒤의 것이다. */
  async function loadMissed(): Promise<Comment[]> {
    const lastId = comments.at(-1)?.id ?? 0
    if (!everLoaded || lastId === 0) return (await fetchFirst()).items
    const missed: Comment[] = []
    let before: number | undefined
    for (let pages = 0; pages < MAX_BACKFILL_PAGES; pages += 1) {
      const page = await (before === undefined ? fetchFirst() : deps.fetchPage(broadcastId, before))
      missed.push(...page.items.filter((comment) => comment.id > lastId))
      if (page.items.some((comment) => comment.id <= lastId) || page.nextCursor === null) break
      before = page.nextCursor
    }
    return missed
  }

  function retryLater(session: number) {
    cancelRetry = schedule(() => {
      cancelRetry = null
      if (session === generation) void connect(session)
    }, RECONNECT_DELAY_MS)
  }

  /** 처음 연결하다 실패했으면 failed, 이미 채팅을 보여 주던 중이면 조용히 다시 시도한다. */
  function connectionFailed(session: number) {
    if (session !== generation) return
    teardown()
    if (everLoaded) retryLater(session)
    else set({ phase: 'failed', message: CHAT_LOAD_FAILURE_MESSAGE })
  }

  async function connect(session: number) {
    const connection: Connection = { loaded: false, buffered: [], bufferedDonations: [], endedEarly: false }

    function handleMessage(message: ChatMessage) {
      if (session !== generation || current.phase === 'ended') return
      if (message.type === 'ended') {
        if (connection.loaded) set({ phase: 'ended', comments, donations })
        else connection.endedEarly = true
        return
      }
      if (message.type === 'donation') {
        if (!connection.loaded) {
          connection.bufferedDonations.push(message.donation)
          return
        }
        const nextDonations = merge(donations, [message.donation])
        if (nextDonations !== donations) {
          donations = nextDonations
          set({ phase: 'open', comments, donations })
        }
        return
      }
      if (!connection.loaded) {
        connection.buffered.push(message.comment)
        return
      }
      const next = merge(comments, [message.comment])
      if (next !== comments) {
        comments = next
        set({ phase: 'open', comments, donations })
      }
    }

    function handleClose() {
      if (session !== generation || connection.endedEarly || current.phase === 'ended') return
      // 이 연결에서 진행 중이던 목록 요청은 버리고 새 연결로 처음부터 이어 간다.
      generation += 1
      channel = null
      teardown()
      retryLater(generation)
    }

    let opened: ChatChannel
    try {
      opened = await deps.openChat(broadcastId, { onMessage: handleMessage, onClose: handleClose })
    } catch {
      connectionFailed(session)
      return
    }
    if (session !== generation) {
      opened.close()
      return
    }
    channel = opened

    try {
      const missed = await loadMissed()
      if (session !== generation) return
      comments = merge(merge(comments, missed), connection.buffered)
      donations = merge(donations, connection.bufferedDonations)
      everLoaded = true
      connection.loaded = true
      set(connection.endedEarly ? { phase: 'ended', comments, donations } : { phase: 'open', comments, donations })
    } catch {
      connectionFailed(session)
    }
  }

  return {
    state: () => current,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    join() {
      generation += 1
      teardown()
      comments = []
      donations = []
      everLoaded = false
      set({ phase: 'connecting' })
      void connect(generation)
    },

    async send(content) {
      const created = await deps.postComment(broadcastId, content)
      if (current.phase !== 'open') return
      const next = merge(comments, [created])
      if (next !== comments) {
        comments = next
        set({ phase: 'open', comments, donations })
      }
    },

    dispose() {
      generation += 1
      teardown()
      current = { phase: 'connecting' }
    },
  }
}
