import type { ApiFailure, BroadcastKind, BroadcastOwner, LiveStatus } from '../api/broadcasts'
import type { AuthState } from '../auth/auth-context'

/** 방송 요약과 상세가 함께 가진 부분. 허용 동작을 정할 때 필요한 만큼만 받는다. */
export interface ViewableBroadcast {
  kind: BroadcastKind
  owner: Pick<BroadcastOwner, 'id'>
  status?: LiveStatus
}

export interface BroadcastActions {
  rename: boolean
  remove: boolean
  /** 방송 중인 라이브방송의 송출 종료 */
  end: boolean
  /** 댓글 쓰기. 녹화방송에서 로그인한 사용자만 쓴다. */
  comment: boolean
}

export interface BroadcastView {
  /** 목록 표의 상태 칸. 녹화방송은 상태가 없어 '-'이다. */
  statusLabel: '-' | '방송 중' | '종료'
  onAir: boolean
  isOwner: boolean
  actions: BroadcastActions
}

/** 방송과 로그인 상태에서 상태 표시, 소유자 여부, 허용 동작을 정한다. 화면에서 숨기는 것은 보조 수단이고 권한은 서버가 검사한다. */
export function viewBroadcast(broadcast: ViewableBroadcast, auth: AuthState): BroadcastView {
  const live = broadcast.kind === 'LIVE'
  const onAir = live && broadcast.status === 'ON_AIR'
  const isOwner = auth.status === 'user' && auth.user.id === broadcast.owner.id
  return {
    statusLabel: live ? (onAir ? '방송 중' : '종료') : '-',
    onAir,
    isOwner,
    actions: {
      rename: isOwner,
      remove: isOwner,
      end: isOwner && onAir,
      comment: !live && auth.status === 'user',
    },
  }
}

/** 내 댓글에만 삭제를 보여 준다. */
export function canDeleteComment(auth: AuthState, authorId: number): boolean {
  return auth.status === 'user' && auth.user.id === authorId
}

export type ManageAction = 'rename' | 'delete' | 'end'

const FALLBACK: Record<ManageAction, string> = {
  rename: '제목을 고치지 못했습니다. 잠시 뒤 다시 시도하세요',
  delete: '방송을 지우지 못했습니다. 잠시 뒤 다시 시도하세요',
  end: '송출을 종료하지 못했습니다. 잠시 뒤 다시 시도하세요',
}

const FORBIDDEN: Record<ManageAction, string> = {
  rename: '소유자만 제목을 고칠 수 있습니다',
  delete: '소유자만 지울 수 있습니다',
  end: '소유자만 종료할 수 있습니다',
}

const NOT_FOUND: Record<ManageAction, string> = {
  rename: '방송을 찾을 수 없습니다',
  delete: '이미 지워진 방송입니다',
  end: '이미 지워진 방송입니다',
}

/** 관리 대화상자(제목 수정·삭제·송출 종료)의 실패 문구. 401처럼 따로 정하지 않은 실패는 동작별 기본 문구다. */
export function manageFailureMessage(action: ManageAction, failure: ApiFailure): string {
  switch (failure.kind) {
    case 'forbidden':
      return FORBIDDEN[action]
    case 'notFound':
      return NOT_FOUND[action]
    case 'invalid':
      return action === 'rename' ? (failure.fieldErrors.title ?? '제목을 고치지 못했습니다') : FALLBACK[action]
    case 'conflict':
      return action === 'delete' ? failure.message : FALLBACK[action]
    default:
      return FALLBACK[action]
  }
}

export interface BroadcastTime {
  /** 라이브방송만 시작·종료 라벨이 붙는다. */
  label: '시작' | '종료' | null
  at: string
}

/** 상세 머리에 보여 줄 시각들. */
export function broadcastTimes(broadcast: { kind: BroadcastKind; createdAt: string; endedAt?: string | null }): BroadcastTime[] {
  if (broadcast.kind === 'RECORDING') return [{ label: null, at: broadcast.createdAt }]
  const times: BroadcastTime[] = [{ label: '시작', at: broadcast.createdAt }]
  if (broadcast.endedAt) times.push({ label: '종료', at: broadcast.endedAt })
  return times
}
