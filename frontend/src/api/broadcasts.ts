import axios from 'axios'
import { sizeLimitMessage } from '../lib/upload-rules'

// 2단계에서 LIVE를 더하면 아래 합집합에 변형이 늘고, 처리하지 않은 곳을 타입 검사가 알려 준다.
export type BroadcastKind = 'RECORDING'

// 목록 카드에 쓰는 방송 요약. 썸네일이 없으면 thumbnailUrl이 null이다.
export interface RecordingBroadcastSummary {
  id: number
  kind: 'RECORDING'
  title: string
  createdAt: string
  durationSeconds: number | null
  thumbnailUrl: string | null
}

export type BroadcastSummary = RecordingBroadcastSummary

export interface BroadcastPage {
  items: BroadcastSummary[]
  hasNext: boolean
}

export interface RecordingBroadcastDetail {
  id: number
  kind: 'RECORDING'
  title: string
  createdAt: string
  video: {
    url: string
    contentType: string
    sizeBytes: number
    durationSeconds: number | null
    thumbnailUrl: string | null
  }
}

export type BroadcastDetail = RecordingBroadcastDetail

/** 서버가 알려 주는 업로드 크기 상한(바이트). */
export interface UploadPolicy {
  maxVideoBytes: number
  maxThumbnailBytes: number
  maxTitleLength: number
}

export interface RegisterBroadcastInput {
  title: string
  video: File
  thumbnail: Blob | null
  durationSeconds: number | null
}

// 화면은 상대 경로로 호출하고, 개발 중에는 Vite 프록시가 백엔드로 넘긴다.
// before가 있으면 그 id보다 작은(더 오래된) 방송 묶음을 받는다.
export async function fetchBroadcasts(before?: number): Promise<BroadcastPage> {
  const response = await axios.get<BroadcastPage>('/api/broadcasts', {
    params: before === undefined ? undefined : { before },
  })
  return response.data
}

export async function fetchUploadPolicy(): Promise<UploadPolicy> {
  const response = await axios.get<UploadPolicy>('/api/broadcasts/upload-policy')
  return response.data
}

export async function fetchBroadcast(id: string): Promise<BroadcastDetail> {
  const response = await axios.get<BroadcastDetail>(`/api/broadcasts/${encodeURIComponent(id)}`)
  return response.data
}

/** 녹화방송을 등록한다. onProgress에는 업로드 진행률(0~100)이 전달된다. */
export async function registerBroadcast(
  input: RegisterBroadcastInput,
  onProgress?: (percent: number) => void,
): Promise<BroadcastDetail> {
  const form = new FormData()
  form.append('title', input.title)
  form.append('video', input.video)
  if (input.thumbnail) form.append('thumbnail', input.thumbnail, 'thumbnail.jpg')
  if (input.durationSeconds !== null) {
    form.append('durationSeconds', String(input.durationSeconds))
  }
  const response = await axios.post<BroadcastDetail>('/api/broadcasts', form, {
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100))
    },
  })
  return response.data
}

/** 요청 실패를 화면이 쓰기 좋게 푼 것. 페이지는 axios를 직접 다루지 않고 이 값만 본다. */
export type ApiFailure =
  | { kind: 'notFound' }
  /** 필드 이름(title, video, thumbnail, durationSeconds)별 이유 */
  | { kind: 'invalid'; fieldErrors: Record<string, string> }
  /** 서버가 알려 준 상한(바이트)과 사용자에게 보여 줄 메시지 */
  | { kind: 'tooLarge'; maxBytes: number; message: string }
  | { kind: 'unknown' }

/** 서버가 돌려준 오류(ProblemDetail)를 ApiFailure로 푼다. 알아볼 수 없으면 unknown이다. */
export function decodeFailure(error: unknown): ApiFailure {
  if (!axios.isAxiosError(error) || !error.response) return { kind: 'unknown' }
  const { status } = error.response
  if (status === 404) return { kind: 'notFound' }
  const data: unknown = error.response.data
  if (typeof data !== 'object' || data === null) return { kind: 'unknown' }
  const { errors, maxBytes, detail } = data as {
    errors?: unknown
    maxBytes?: unknown
    detail?: unknown
  }
  if (status === 413 && typeof maxBytes === 'number') {
    const message = typeof detail === 'string' && detail !== '' ? detail : sizeLimitMessage(maxBytes)
    return { kind: 'tooLarge', maxBytes, message }
  }
  if (status === 400 && Array.isArray(errors)) {
    const fieldErrors: Record<string, string> = {}
    for (const item of errors) {
      if (typeof item?.field === 'string' && typeof item?.reason === 'string') {
        fieldErrors[item.field] ??= item.reason
      }
    }
    if (Object.keys(fieldErrors).length > 0) return { kind: 'invalid', fieldErrors }
  }
  return { kind: 'unknown' }
}
