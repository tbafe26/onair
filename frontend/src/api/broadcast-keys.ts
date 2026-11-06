import type { BroadcastKind } from './broadcasts'

// TanStack Query 키를 한곳에서 만든다. 등록 후 all을 무효화하면 목록·패널·상세가 모두 새로 받아진다.
export const broadcastKeys = {
  all: ['broadcasts'] as const,
  /** 상세 화면 "방송 더보기" 패널이 쓰는 첫 묶음 */
  list: () => [...broadcastKeys.all, 'list'] as const,
  /** 목록 화면의 무한 조회. 캐시 모양이 달라 list와 키를 나눈다. */
  infinite: (kind: BroadcastKind) => [...broadcastKeys.all, 'infinite', kind] as const,
  /** 내 방송 화면의 무한 조회 */
  mine: () => [...broadcastKeys.all, 'mine'] as const,
  detail: (id: string) => [...broadcastKeys.all, 'detail', id] as const,
  /** 서버의 업로드 정책. 방송 데이터와 무관해 등록 후 무효화 대상이 아니다. */
  uploadPolicy: () => ['upload-policy'] as const,
}
