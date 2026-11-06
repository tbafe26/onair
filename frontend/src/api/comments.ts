import { decodeFailure } from './broadcasts'
import { apiClient } from './client'

/** 댓글 작성자. 닉네임을 보여 주고, id로 내 댓글인지 가른다. */
export interface CommentAuthor {
  id: number
  nickname: string
}

export interface Comment {
  id: number
  content: string
  author: CommentAuthor
  createdAt: string
}

/** 최신순 한 묶음. nextCursor가 있으면 그 값을 before로 넘겨 더 오래된 댓글을 받는다. */
export interface CommentPage {
  items: Comment[]
  nextCursor: number | null
  totalCount: number
}

/** 서버의 댓글 길이 상한. 서버와 같은 값으로 미리 검사해 남은 글자 수를 보여 준다. */
export const MAX_COMMENT_LENGTH = 300

export const commentKeys = {
  list: (broadcastId: number) => ['comments', broadcastId] as const,
}

export async function fetchComments(broadcastId: number, before?: number): Promise<CommentPage> {
  const response = await apiClient.get<CommentPage>(`/api/broadcasts/${broadcastId}/comments`, {
    params: { before },
  })
  return response.data
}

/** 댓글을 쓴다(로그인 필요). 만들어진 댓글을 돌려준다. */
export async function postComment(broadcastId: number, content: string): Promise<Comment> {
  const response = await apiClient.post<Comment>(`/api/broadcasts/${broadcastId}/comments`, { content })
  return response.data
}

/** 댓글 요청 실패를 사용자에게 보일 문장으로 바꾼다. 서버가 알려 준 입력 오류가 있으면 그것을, 아니면 fallback을 쓴다. */
export function decodeCommentFailure(error: unknown, fallback: string): string {
  const failure = decodeFailure(error)
  switch (failure.kind) {
    case 'invalid':
      return failure.fieldErrors.content ?? fallback
    case 'unauthorized':
      return '로그인이 필요합니다'
    case 'forbidden':
      return '작성자만 지울 수 있습니다'
    case 'notFound':
      return '이미 지워졌거나 없는 댓글입니다'
    default:
      return fallback
  }
}

/** 댓글을 지운다(작성자만). */
export async function deleteComment(broadcastId: number, commentId: number): Promise<void> {
  await apiClient.delete(`/api/broadcasts/${broadcastId}/comments/${commentId}`)
}
