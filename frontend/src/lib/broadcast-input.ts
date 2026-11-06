// 방송 입력(제목·썸네일) 규칙. 녹화방송 등록과 라이브 송출이 같은 규칙과 같은 오류 배치를 쓴다.
// React와 무관하고, 상한은 서버의 업로드 정책에서 받는다. 정책을 모르면(null) 그 검사는 서버에 맡긴다.
import type { ApiFailure, UploadPolicy } from '../api/broadcasts'
import { toJpegThumbnail, type ThumbnailImageDeps } from './thumbnail-image'
import { validateTitle } from './upload-rules'

export type BroadcastInputPolicy = Pick<UploadPolicy, 'maxTitleLength' | 'maxThumbnailBytes'>

/** 서버 오류를 화면의 어디에 보여 줄지 정한 결과. */
export interface PlacedFailure {
  /** 제목 입력란 옆 메시지 */
  title: string | null
  /** 영상 입력란 옆 메시지(영상 요청의 413 포함) */
  video: string | null
  /** 썸네일 옆 메시지(영상이 없는 요청의 413 포함) */
  thumbnail: string | null
  /** 입력란이 없는 필드(재생 시간)의 메시지 */
  others: string[]
  /** 어느 필드의 오류도 아닌 알 수 없는 실패 */
  unknown: boolean
}

export type TooLargeField = 'video' | 'thumbnail'

export interface BroadcastInput {
  /** 올바르면 null, 아니면 사용자에게 보여 줄 이유. */
  checkTitle(title: string): string | null
  /** 사용자가 고른 이미지를 JPEG 썸네일로 바꾼다. 쓸 수 없으면 ThumbnailUnusableError다. */
  convertThumbnail(file: Blob): Promise<Blob>
  /** 이미 만들어 둔 이미지(영상에서 뽑은 프레임)를 같은 변환에 태운다. 쓸 수 없으면 null이다. */
  prepareThumbnail(image: Blob | null): Promise<Blob | null>
  /** 413이 어느 파일의 것인지는 요청이 안다: 영상을 싣는 등록은 'video', 썸네일만 싣는 라이브 시작은 'thumbnail'이다. */
  placeFailure(failure: ApiFailure, tooLargeField?: TooLargeField): PlacedFailure
}

export function createBroadcastInput(
  policy: BroadcastInputPolicy | null,
  imageDeps: ThumbnailImageDeps,
): BroadcastInput {
  const maxThumbnailBytes = policy?.maxThumbnailBytes ?? null
  const convertThumbnail = (file: Blob) => toJpegThumbnail(file, imageDeps, maxThumbnailBytes)
  return {
    checkTitle: (title) => validateTitle(title, policy?.maxTitleLength ?? null),
    convertThumbnail,
    // 썸네일은 선택 항목이라 큰 썸네일 때문에 시작·등록 전체가 거절되느니 썸네일 없이 진행한다.
    prepareThumbnail: async (image) => {
      if (image === null) return null
      return convertThumbnail(image).catch(() => null)
    },
    placeFailure,
  }
}

function placeFailure(failure: ApiFailure, tooLargeField: TooLargeField = 'video'): PlacedFailure {
  const fieldErrors = failure.kind === 'invalid' ? failure.fieldErrors : {}
  const tooLarge = failure.kind === 'tooLarge' ? failure.message : null
  return {
    title: fieldErrors.title ?? null,
    video: (tooLargeField === 'video' ? tooLarge : null) ?? fieldErrors.video ?? null,
    thumbnail: (tooLargeField === 'thumbnail' ? tooLarge : null) ?? fieldErrors.thumbnail ?? null,
    others: [fieldErrors.durationSeconds].filter((m) => m !== undefined),
    unknown: failure.kind !== 'invalid' && failure.kind !== 'tooLarge',
  }
}
