import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  MAX_COMMENT_LENGTH,
  commentKeys,
  decodeCommentFailure,
  deleteComment,
  fetchComments,
  postComment,
  type Comment,
} from '../api/comments'
import { useAuth } from '../auth/auth-context'
import { formatDateTime } from '../lib/format'
import { Modal } from './Modal'
import { Button } from './ui/button'

/** 녹화방송 영상 아래의 댓글 구역. 내용은 React의 기본 이스케이프로 글자 그대로 보여 준다. */
export function RecordingComments({ broadcastId }: { broadcastId: number }) {
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: commentKeys.list(broadcastId),
    queryFn: ({ pageParam }) => fetchComments(broadcastId, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
  const comments = data?.pages.flatMap((page) => page.items) ?? []
  const totalCount = data?.pages[data.pages.length - 1]?.totalCount

  return (
    <section aria-labelledby="comments-title" className="mt-8">
      <h2 id="comments-title" className="text-lg font-bold text-foreground">
        {totalCount === undefined ? '댓글' : `댓글 ${totalCount}개`}
      </h2>
      <CommentForm broadcastId={broadcastId} />
      {isPending && <p className="mt-4 text-sub">불러오는 중...</p>}
      {isError && !data && (
        <div className="mt-4 flex flex-col items-start gap-3">
          <p className="text-sub">댓글을 불러오지 못했습니다.</p>
          <Button onClick={() => void refetch()}>다시 시도</Button>
        </div>
      )}
      {data && comments.length === 0 && <p className="mt-4 text-sub">아직 댓글이 없습니다</p>}
      {comments.length > 0 && (
        <ul aria-label="댓글" className="mt-4 flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentItem key={comment.id} broadcastId={broadcastId} comment={comment} />
          ))}
        </ul>
      )}
      {hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          댓글 더 보기
        </Button>
      )}
    </section>
  )
}

function CommentForm({ broadcastId }: { broadcastId: number }) {
  const { state } = useAuth()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const write = useMutation({
    mutationFn: (text: string) => postComment(broadcastId, text),
    onSuccess: async () => {
      setContent('')
      setError(null)
      await queryClient.invalidateQueries({ queryKey: commentKeys.list(broadcastId) })
    },
    onError: (failure) => setError(decodeCommentFailure(failure, '댓글을 쓰지 못했습니다. 잠시 뒤 다시 시도하세요')),
  })

  if (state.status === 'loading') return null
  if (state.status === 'guest') {
    const next = encodeURIComponent(location.pathname + location.search)
    return (
      <p className="mt-3 text-sub">
        로그인 후 댓글을 쓸 수 있습니다{' '}
        <Link to={`/login?next=${next}`} className="font-semibold text-foreground underline">
          로그인
        </Link>
      </p>
    )
  }

  const trimmedLength = content.trim().length
  const remaining = MAX_COMMENT_LENGTH - content.trim().length
  const canSubmit = trimmedLength > 0 && remaining >= 0 && !write.isPending

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (canSubmit) write.mutate(content.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
      <textarea
        aria-label="댓글"
        value={content}
        rows={3}
        placeholder="댓글을 입력하세요"
        className="w-full resize-y rounded-lg border border-border bg-card p-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => setContent(event.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <span className={remaining < 0 ? 'text-sm text-destructive' : 'text-sm text-sub'}>
          {remaining < 0 ? `${-remaining}자 초과` : `${remaining}자 남음`}
        </span>
        <Button type="submit" disabled={!canSubmit}>
          등록
        </Button>
      </div>
    </form>
  )
}

function CommentItem({ broadcastId, comment }: { broadcastId: number; comment: Comment }) {
  const { state } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const mine = state.status === 'user' && state.user.id === comment.author.id

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-foreground">{comment.author.nickname}</span>
        <time dateTime={comment.createdAt} className="text-sub">
          {formatDateTime(comment.createdAt)}
        </time>
        {mine && (
          <Button type="button" variant="ghost" className="h-7 px-3 text-sm" onClick={() => setConfirming(true)}>
            삭제
          </Button>
        )}
      </div>
      <p className="whitespace-pre-wrap break-words text-foreground">{comment.content}</p>
      {confirming && (
        <DeleteCommentDialog broadcastId={broadcastId} comment={comment} onClose={() => setConfirming(false)} />
      )}
    </li>
  )
}

/** 삭제 확인. 확인하면 지우고 댓글 목록을 새로 받는다. */
function DeleteCommentDialog({
  broadcastId,
  comment,
  onClose,
}: {
  broadcastId: number
  comment: Comment
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: () => deleteComment(broadcastId, comment.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: commentKeys.list(broadcastId) })
      onClose()
    },
    onError: (failure) => setError(decodeCommentFailure(failure, '댓글을 지우지 못했습니다. 잠시 뒤 다시 시도하세요')),
  })

  return (
    <Modal title="댓글 삭제" onClose={onClose}>
      <p className="mt-4 text-foreground">이 댓글을 삭제할까요? 되돌릴 수 없습니다.</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          취소
        </Button>
        <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
          삭제
        </Button>
      </div>
    </Modal>
  )
}
