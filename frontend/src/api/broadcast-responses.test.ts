import { describe, expect, it } from 'vitest'
import contract from '../../../contracts/broadcast-responses.json'
import type {
  LiveBroadcastDetail,
  LiveBroadcastSummary,
  RecordingBroadcastDetail,
  RecordingBroadcastSummary,
} from './broadcasts'

// 타입에 필드가 모자라거나 남으면 satisfies가 tsc(pnpm build)에서 실패하고,
// 계약 파일과 어긋나면 아래 Object.keys 대조가 vitest에서 실패한다.
// null 가능 필드는 일부러 null로 둔다(서버는 null도 직렬화한다).
const recordingSummary = {
  id: 1,
  kind: 'RECORDING',
  title: '제목',
  createdAt: '2026-01-01T00:00:00Z',
  durationSeconds: null,
  thumbnailUrl: null,
} satisfies RecordingBroadcastSummary

const recordingDetail = {
  id: 1,
  kind: 'RECORDING',
  title: '제목',
  createdAt: '2026-01-01T00:00:00Z',
  video: {
    url: '/api/broadcasts/1/video',
    contentType: 'video/mp4',
    sizeBytes: 1,
    durationSeconds: null,
    thumbnailUrl: null,
  },
} satisfies RecordingBroadcastDetail

const liveSummary = {
  id: 1,
  kind: 'LIVE',
  title: '제목',
  createdAt: '2026-01-01T00:00:00Z',
  thumbnailUrl: null,
  status: 'ON_AIR',
} satisfies LiveBroadcastSummary

const liveDetail = {
  ...liveSummary,
  endedAt: null,
} satisfies LiveBroadcastDetail

interface Shape {
  required: string[]
  nullable: string[]
}

function expectMatches(example: object, shape: Shape) {
  expect(Object.keys(example).sort()).toEqual([...shape.required, ...shape.nullable].sort())
  const values = example as Record<string, unknown>
  for (const name of shape.required) expect(values[name]).not.toBeNull()
  for (const name of shape.nullable) expect(values[name]).toBeNull()
}

describe('방송 응답 타입이 contracts/broadcast-responses.json과 같다', () => {
  it('녹화방송 목록 항목', () => {
    expectMatches(recordingSummary, contract.RECORDING.summary)
  })

  it('녹화방송 상세와 video', () => {
    expectMatches(recordingDetail, contract.RECORDING.detail)
    expectMatches(recordingDetail.video, contract.RECORDING.detail.video)
  })

  it('라이브방송 목록 항목', () => {
    expectMatches(liveSummary, contract.LIVE.summary)
  })

  it('라이브방송 상세', () => {
    expectMatches(liveDetail, contract.LIVE.detail)
  })
})
