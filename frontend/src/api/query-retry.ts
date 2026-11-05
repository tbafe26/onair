import { decodeFailure } from './broadcasts'

const MAX_RETRIES = 3

/**
 * 조회 실패를 다시 시도할지 정한다. 서버가 이유를 밝힌 실패(없음, 입력 오류, 크기 초과)는
 * 다시 보내도 결과가 같으므로 바로 보여 주고, 원인을 모르는 실패(5xx, 연결 끊김)만 다시 시도한다.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return decodeFailure(error).kind === 'unknown' && failureCount < MAX_RETRIES
}
