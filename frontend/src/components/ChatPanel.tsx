import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MAX_COMMENT_LENGTH, decodeCommentFailure, type Comment } from '../api/comments'
import { applyDonationEvent, donationKeys } from '../api/donations'
import { useAuth } from '../auth/auth-context'
import { cn } from '@/lib/utils'
import type { ChatState } from '../live/chat'
import type { ChatDonation } from '../live/chat-protocol'
import { useLiveChat } from '../live/useLiveChat'
import { Button } from './ui/button'

/** 맨 아래에서 이 거리(px) 안이면 맨 아래에 있다고 본다. */
const STICK_THRESHOLD = 40

/**
 * 라이브방송 채팅 패널. 채팅 내용은 React의 기본 이스케이프로 글자 그대로 보여 준다.
 * 높이는 className으로 정한다. 목록이 넘치면 패널 안에서만 스크롤한다.
 */
export function ChatPanel({ broadcastId, className }: { broadcastId: number; className?: string }) {
  const { state, send, retry, onReconnected } = useLiveChat(broadcastId)
  useDonationEvents(broadcastId, state, onReconnected)

  return (
    <section
      aria-labelledby={`chat-title-${broadcastId}`}
      className={cn('flex h-[28rem] flex-col overflow-hidden rounded-xl border border-border bg-card', className)}
    >
      <h2 id={`chat-title-${broadcastId}`} className="border-b border-border px-4 py-3 text-base font-bold text-foreground">
        채팅
      </h2>
      <ChatList state={state} onRetry={retry} />
      <ChatInput state={state} send={send} />
    </section>
  )
}

/**
 * 채팅으로 온 후원을 후원 영역의 조회 캐시에 반영한다. 반영한 id는 기억해 같은 후원을 두 번 합치지 않는다.
 * 다른 방송으로 바뀌거나 채팅을 다시 시작해 후원 목록이 비면 처음부터 다시 센다.
 * 연결이 끊긴 동안 놓친 후원은 채팅으로 오지 않으므로, 다시 연결되면 후원 내역을 다시 불러온다.
 */
function useDonationEvents(broadcastId: number, state: ChatState, onReconnected: (listener: () => void) => () => void) {
  const queryClient = useQueryClient()
  const applied = useRef(new Set<number>())
  const donations = state.phase === 'open' || state.phase === 'ended' ? state.donations : null

  useEffect(() => {
    applied.current = new Set()
  }, [broadcastId])

  useEffect(() => {
    if (!donations) return
    for (const donation of donations) {
      if (applied.current.has(donation.id)) continue
      applied.current.add(donation.id)
      queryClient.setQueryData<ReturnType<typeof applyDonationEvent>>(donationKeys.list(broadcastId), (data) =>
        applyDonationEvent(data, donation),
      )
    }
  }, [broadcastId, donations, queryClient])

  useEffect(
    () => onReconnected(() => void queryClient.invalidateQueries({ queryKey: donationKeys.list(broadcastId) })),
    [broadcastId, onReconnected, queryClient],
  )
}

type ChatItem = { key: string; at: number; comment: Comment; donation?: undefined } | { key: string; at: number; donation: ChatDonation; comment?: undefined }

/** 채팅과 후원을 시간 순(같은 시각이면 채팅이 먼저)으로 한 줄씩 늘어놓는다. */
function timeline(comments: Comment[], donations: ChatDonation[]): ChatItem[] {
  const items: ChatItem[] = [
    ...comments.map((comment) => ({ key: `c${comment.id}`, at: Date.parse(comment.createdAt), comment })),
    ...donations.map((donation) => ({ key: `d${donation.id}`, at: Date.parse(donation.confirmedAt), donation })),
  ]
  return items.sort((a, b) => a.at - b.at || (a.donation ? 1 : 0) - (b.donation ? 1 : 0))
}

function ChatList({ state, onRetry }: { state: ChatState; onRetry: () => void }) {
  const listRef = useRef<HTMLDivElement>(null)
  // 맨 아래에 있을 때만 새 채팅을 따라 내려간다. 위로 올려 읽는 동안에는 위치를 그대로 둔다.
  const stickRef = useRef(true)
  const comments = state.phase === 'open' || state.phase === 'ended' ? state.comments : null
  const donations = state.phase === 'open' || state.phase === 'ended' ? state.donations : null
  const items = useMemo(() => (comments && donations ? timeline(comments, donations) : null), [comments, donations])

  useLayoutEffect(() => {
    const list = listRef.current
    if (list && stickRef.current) list.scrollTop = list.scrollHeight
  }, [items])

  function handleScroll() {
    const list = listRef.current
    if (list) stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= STICK_THRESHOLD
  }

  return (
    <div ref={listRef} data-testid="chat-scroll" onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {state.phase === 'connecting' && <p className="text-sub">채팅을 불러오는 중...</p>}
      {state.phase === 'failed' && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sub">{state.message}</p>
          <Button type="button" onClick={onRetry}>
            다시 시도
          </Button>
        </div>
      )}
      {items && items.length === 0 && <p className="text-sub">아직 채팅이 없습니다</p>}
      {items && items.length > 0 && (
        <ul aria-label="채팅 목록" className="flex flex-col gap-1.5 text-sm">
          {items.map((item) =>
            item.donation ? (
              <li
                key={item.key}
                data-donation=""
                className="break-words whitespace-pre-wrap rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-2"
              >
                <span className="mr-2 font-semibold text-foreground">{item.donation.donor.nickname}</span>
                <span className="font-bold text-primary">{item.donation.amount.toLocaleString('ko-KR')}원 후원</span>
                {item.donation.message && <p className="mt-0.5 text-foreground">{item.donation.message}</p>}
              </li>
            ) : (
              <li key={item.key} className="break-words whitespace-pre-wrap">
                <span className="mr-2 font-semibold text-foreground">{item.comment.author.nickname}</span>
                <span className="text-foreground">{item.comment.content}</span>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

function ChatInput({ state, send }: { state: ChatState; send: (content: string) => Promise<void> }) {
  const { state: auth } = useAuth()
  const location = useLocation()
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (state.phase === 'ended') {
    return (
      <p role="status" className="border-t border-border px-4 py-3 text-sm text-sub">
        채팅이 종료되었습니다
      </p>
    )
  }
  if (auth.status === 'loading') return null
  if (auth.status === 'guest') {
    const next = encodeURIComponent(location.pathname + location.search)
    return (
      <p className="border-t border-border px-4 py-3 text-sm text-sub">
        로그인 후 채팅에 참여할 수 있습니다{' '}
        <Link to={`/login?next=${next}`} className="font-semibold text-foreground underline">
          로그인
        </Link>
      </p>
    )
  }

  async function submit() {
    const text = content.trim()
    if (text.length === 0 || sending) return
    setSending(true)
    try {
      await send(text)
      setContent('')
      setError(null)
    } catch (failure) {
      setError(decodeCommentFailure(failure, '채팅을 보내지 못했습니다. 잠시 뒤 다시 시도하세요'))
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // 한글 조합 중의 Enter는 글자를 확정하는 키이므로 보내지 않는다.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void submit()
  }

  return (
    <div className="flex flex-col gap-1 border-t border-border p-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <textarea
        aria-label="채팅 입력"
        value={content}
        rows={2}
        maxLength={MAX_COMMENT_LENGTH}
        disabled={state.phase !== 'open'}
        placeholder="채팅을 입력하세요 (Enter로 보내기, Shift+Enter로 줄바꿈)"
        className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
