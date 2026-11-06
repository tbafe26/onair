import axios from 'axios'
import { apiClient } from './client'
import { sizeLimitMessage } from '../lib/upload-rules'

// 방송 종류가 늘면 아래 합집합에 변형이 늘고, 처리하지 않은 곳을 타입 검사가 알려 준다.
export type BroadcastKind = 'RECORDING' | 'LIVE'

/** 라이브방송 상태. 방송 중에서 종료로만 바뀐다. */
export type LiveStatus = 'ON_AIR' | 'ENDED'

/** 방송 소유자. 카드와 상세에서 채널 이름처럼 닉네임을 보여 준다. */
export interface BroadcastOwner {
  id: number
  nickname: string
}

// 목록 카드에 쓰는 방송 요약. 썸네일이 없으면 thumbnailUrl이 null이다.
export interface RecordingBroadcastSummary {
  id: number
  kind: 'RECORDING'
  title: string
  createdAt: string
  owner: BroadcastOwner
  durationSeconds: number | null
  thumbnailUrl: string | null
}

// 라이브방송의 createdAt은 송출 시작 시각이다. 재생 시간은 없다.
export interface LiveBroadcastSummary {
  id: number
  kind: 'LIVE'
  title: string
  createdAt: string
  owner: BroadcastOwner
  thumbnailUrl: string | null
  status: LiveStatus
}

export type BroadcastSummary = RecordingBroadcastSummary | LiveBroadcastSummary

export interface BroadcastPage {
  items: BroadcastSummary[]
  hasNext: boolean
}

export interface RecordingBroadcastDetail {
  id: number
  kind: 'RECORDING'
  title: string
  createdAt: string
  owner: BroadcastOwner
  video: {
    url: string
    contentType: string
    sizeBytes: number
    durationSeconds: number | null
    thumbnailUrl: string | null
  }
}

export interface LiveBroadcastDetail extends LiveBroadcastSummary {
  /** 종료 시각. 방송 중이면 null이다. */
  endedAt: string | null
}

export type BroadcastDetail = RecordingBroadcastDetail | LiveBroadcastDetail

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
// before가 있으면 그 id보다 작은(더 오래된) 방송 묶음을 받고, kind가 있으면 그 종류만 받는다.
export async function fetchBroadcasts(
  before?: number,
  kind?: BroadcastKind,
): Promise<BroadcastPage> {
  const response = await apiClient.get<BroadcastPage>('/api/broadcasts', {
    params: { kind, before },
  })
  return response.data
}

/** 내 방송 목록. 로그인이 필요하고, before 커서는 fetchBroadcasts와 같다. */
export async function fetchMyBroadcasts(before?: number): Promise<BroadcastPage> {
  const response = await apiClient.get<BroadcastPage>('/api/me/broadcasts', { params: { before } })
  return response.data
}

/** 제목을 고친다(소유자만). 고친 상세를 돌려준다. */
export async function renameBroadcast(id: number, title: string): Promise<BroadcastDetail> {
  const response = await apiClient.patch<BroadcastDetail>(`/api/broadcasts/${id}`, { title })
  return response.data
}

/** 방송을 지운다(소유자만). 방송 중인 라이브방송은 409다. */
export async function deleteBroadcast(id: number): Promise<void> {
  await apiClient.delete(`/api/broadcasts/${id}`)
}

/** 방송 중인 라이브방송을 종료한다(소유자만). 이미 종료됐어도 성공이다. */
export async function endBroadcast(id: number): Promise<void> {
  await apiClient.post(`/api/broadcasts/${id}/end`)
}

export async function fetchUploadPolicy(): Promise<UploadPolicy> {
  const response = await apiClient.get<UploadPolicy>('/api/broadcasts/upload-policy')
  return response.data
}

export async function fetchBroadcast(id: string): Promise<BroadcastDetail> {
  const response = await apiClient.get<BroadcastDetail>(`/api/broadcasts/${encodeURIComponent(id)}`)
  return response.data
}

/** 녹화방송을 등록한다. onProgress에는 업로드 진행률(0~100)이 전달된다. */
export async function registerBroadcast(
  input: RegisterBroadcastInput,
  onProgress?: (percent: number) => void,
): Promise<RecordingBroadcastDetail> {
  const form = new FormData()
  form.append('title', input.title)
  form.append('video', input.video)
  if (input.thumbnail) form.append('thumbnail', input.thumbnail, 'thumbnail.jpg')
  if (input.durationSeconds !== null) {
    form.append('durationSeconds', String(input.durationSeconds))
  }
  const response = await apiClient.post<RecordingBroadcastDetail>('/api/broadcasts', form, {
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100))
    },
  })
  return response.data
}

/** 라이브방송 시작이 돌려주는 값. 송출 키는 이 응답에만 있고 어떤 조회 응답에도 없다. */
export interface StartedLive {
  id: number
  streamKey: string
}

/** 라이브방송을 시작한다(송출 시작). */
export async function startLiveBroadcast(input: {
  title: string
  thumbnail: Blob | null
}): Promise<StartedLive> {
  const form = new FormData()
  form.append('title', input.title)
  if (input.thumbnail) form.append('thumbnail', input.thumbnail, 'thumbnail.jpg')
  const response = await apiClient.post<StartedLive>('/api/broadcasts/live', form)
  return response.data
}

/** 요청 실패를 화면이 쓰기 좋게 푼 것. 페이지는 axios를 직접 다루지 않고 이 값만 본다. */
export type ApiFailure =
  | { kind: 'notFound' }
  /** 로그인하지 않았거나 로그인 정보가 맞지 않다(401) */
  | { kind: 'unauthorized' }
  /** 로그인했지만 소유자가 아니다(403) */
  | { kind: 'forbidden' }
  /** 서버의 현재 상태와 맞지 않는 요청(409). 이유는 서버가 알려 준 메시지다. */
  | { kind: 'conflict'; message: string }
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
  if (status === 401) return { kind: 'unauthorized' }
  if (status === 403) return { kind: 'forbidden' }
  const data: unknown = error.response.data
  if (typeof data !== 'object' || data === null) return { kind: 'unknown' }
  const { errors, maxBytes, detail } = data as {
    errors?: unknown
    maxBytes?: unknown
    detail?: unknown
  }
  if (status === 409) {
    return { kind: 'conflict', message: typeof detail === 'string' && detail !== '' ? detail : '요청을 처리할 수 없습니다' }
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
