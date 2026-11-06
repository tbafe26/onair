import { describe, expect, it } from 'vitest'
import contract from '../../../contracts/signaling.json'
import {
  MessageType,
  answerFromViewer,
  candidateFromViewer,
  candidateTo,
  endBroadcast,
  heartbeat,
  joinBroadcaster,
  joinViewer,
  offerTo,
  RejectionReason,
  START_FAILURE_MESSAGE,
  VIEW_FAILURE_MESSAGE,
  asSignalMessage,
  broadcasterRejectionMessage,
  parseBroadcasterInbound,
  parseViewerInbound,
  viewerRejection,
} from './signaling-protocol'

describe('계약 파일 대조', () => {
  it('메시지 종류가 contracts/signaling.json과 같다', () => {
    expect(Object.values(MessageType).sort()).toEqual(Object.keys(contract.messages).sort())
  })

  it('거절 사유가 contracts/signaling.json과 같다', () => {
    expect(Object.values(RejectionReason).sort()).toEqual([...contract.rejectionReasons].sort())
  })
})

type Direction = 'broadcaster->server' | 'viewer->server' | 'server->broadcaster' | 'server->viewer'

/** 계약에서 해당 방향의 메시지 종류별 필드 이름. */
function contractFields(direction: Direction): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const [type, directions] of Object.entries(contract.messages) as [string, Partial<Record<Direction, string[]>>][]) {
    const fields = directions[direction]
    if (fields) result[type] = fields
  }
  return result
}

const SAMPLE: Record<string, unknown> = {
  broadcastId: 1,
  viewerId: 'v1',
  reason: 'full',
  count: 2,
  max: 5,
  from: 'v1',
  sdp: 's',
  candidate: { candidate: 'c' },
}

/** 계약대로 필드를 채운 메시지. */
function contractShaped(type: string, fields: string[]) {
  return { type, ...Object.fromEntries(fields.map((name) => [name, SAMPLE[name]])) }
}

function fieldsOf(message: { type: string }): string[] {
  return Object.keys(message).filter((key) => key !== 'type')
}

describe('계약 파일 필드 대조: 보내는 메시지', () => {
  const sent: Record<Direction, Record<string, { type: string }>> = {
    'broadcaster->server': {
      [MessageType.JoinBroadcaster]: joinBroadcaster('k'),
      [MessageType.End]: endBroadcast(),
      [MessageType.Heartbeat]: heartbeat(),
      [MessageType.Offer]: offerTo('v1', 's'),
      [MessageType.Candidate]: candidateTo('v1', { candidate: 'c' }),
    },
    'viewer->server': {
      [MessageType.JoinViewer]: joinViewer(),
      [MessageType.Answer]: answerFromViewer('s'),
      [MessageType.Candidate]: candidateFromViewer({ candidate: 'c' }),
    },
    'server->broadcaster': {},
    'server->viewer': {},
  }

  it.each(['broadcaster->server', 'viewer->server'] as const)('%s 빌더의 필드가 계약과 같다', (direction) => {
    const contracted = contractFields(direction)
    expect(Object.keys(sent[direction]).sort()).toEqual(Object.keys(contracted).sort())
    for (const [type, message] of Object.entries(sent[direction])) {
      expect(message.type).toBe(type)
      expect(fieldsOf(message).sort(), `${direction} ${type}`).toEqual([...contracted[type]].sort())
    }
  })
})

describe('계약 파일 필드 대조: 받는 메시지', () => {
  // 시청자 화면은 joined를 쓰지 않아 파서가 모르는 종류로 본다.
  const unparsed = new Set(['server->viewer joined'])
  // 파서가 일부러 읽지 않는 필드(화면이 쓰지 않는다)
  const unread = new Set(['joined.broadcastId', 'joined.viewerId'])
  // 파서 결과에서 계약 필드가 드러나는 이름
  const exposedAs: Record<string, string> = { from: 'viewerId' }

  it.each([
    ['server->broadcaster', parseBroadcasterInbound],
    ['server->viewer', parseViewerInbound],
  ] as const)('%s 계약 항목을 모두 읽는다', (direction, parse) => {
    const entries = Object.entries(contractFields(direction))
    expect(entries.length).toBeGreaterThan(0)
    for (const [type, fields] of entries) {
      if (unparsed.has(`${direction} ${type}`)) {
        expect(parse(contractShaped(type, fields)), `${direction} ${type}`).toBeNull()
        continue
      }
      const parsed = parse(contractShaped(type, fields)) as Record<string, unknown> | null
      expect(parsed, `${direction} ${type}`).not.toBeNull()
      expect(parsed?.type).toBe(type)
      for (const name of fields) {
        if (unread.has(`${type}.${name}`)) continue
        expect(parsed, `${direction} ${type}.${name}`).toHaveProperty(exposedAs[name] ?? name, SAMPLE[name])
      }
    }
  })
})

describe('asSignalMessage', () => {
  it('type이 문자열인 객체만 메시지로 본다', () => {
    expect(asSignalMessage({ type: 'joined' })).toEqual({ type: 'joined' })
    expect(asSignalMessage({ type: 1 })).toBeNull()
    expect(asSignalMessage({})).toBeNull()
    expect(asSignalMessage('joined')).toBeNull()
    expect(asSignalMessage(null)).toBeNull()
  })
})

describe('parseBroadcasterInbound', () => {
  it('필드를 갖춘 메시지는 좁혀진 모양이 된다', () => {
    expect(parseBroadcasterInbound({ type: 'joined' })).toEqual({ type: 'joined' })
    expect(parseBroadcasterInbound({ type: 'viewer-joined', viewerId: 'a' })).toEqual({ type: 'viewer-joined', viewerId: 'a' })
    expect(parseBroadcasterInbound({ type: 'viewer-count', count: 2, max: 5 })).toEqual({ type: 'viewer-count', count: 2, max: 5 })
    expect(parseBroadcasterInbound({ type: 'viewer-count', count: 2 })).toEqual({ type: 'viewer-count', count: 2, max: null })
    expect(parseBroadcasterInbound({ type: 'answer', from: 'a', sdp: 's' })).toEqual({ type: 'answer', viewerId: 'a', sdp: 's' })
    expect(parseBroadcasterInbound({ type: 'candidate', from: 'a', candidate: { candidate: 'c' } })).toEqual({
      type: 'candidate',
      viewerId: 'a',
      candidate: { candidate: 'c' },
    })
  })

  it('필드가 없거나 모르는 종류면 null이다', () => {
    expect(parseBroadcasterInbound({ type: 'viewer-left' })).toBeNull()
    expect(parseBroadcasterInbound({ type: 'viewer-count', count: '2' })).toBeNull()
    expect(parseBroadcasterInbound({ type: 'answer', from: 'a' })).toBeNull()
    expect(parseBroadcasterInbound({ type: 'candidate', from: 'a', candidate: null })).toBeNull()
    expect(parseBroadcasterInbound({ type: 'offer', sdp: 's' })).toBeNull()
    expect(parseBroadcasterInbound({ type: 'nope' })).toBeNull()
  })

  it('거절 사유는 아는 값만 담고 모르면 null이다', () => {
    expect(parseBroadcasterInbound({ type: 'rejected', reason: 'invalid-key' })).toEqual({ type: 'rejected', reason: 'invalid-key' })
    expect(parseBroadcasterInbound({ type: 'rejected', reason: 'whatever' })).toEqual({ type: 'rejected', reason: null })
    expect(parseBroadcasterInbound({ type: 'rejected' })).toEqual({ type: 'rejected', reason: null })
  })
})

describe('parseViewerInbound', () => {
  it('offer, candidate, rejected, ended를 좁힌다', () => {
    expect(parseViewerInbound({ type: 'offer', sdp: 's' })).toEqual({ type: 'offer', sdp: 's' })
    expect(parseViewerInbound({ type: 'candidate', candidate: { candidate: 'c' } })).toEqual({
      type: 'candidate',
      candidate: { candidate: 'c' },
    })
    expect(parseViewerInbound({ type: 'rejected', reason: 'full' })).toEqual({ type: 'rejected', reason: 'full' })
    expect(parseViewerInbound({ type: 'ended' })).toEqual({ type: 'ended' })
  })

  it('필드가 없거나 시청자가 받지 않는 종류면 null이다', () => {
    expect(parseViewerInbound({ type: 'offer' })).toBeNull()
    expect(parseViewerInbound({ type: 'candidate', candidate: 'c' })).toBeNull()
    expect(parseViewerInbound({ type: 'viewer-joined', viewerId: 'a' })).toBeNull()
  })
})

describe('거절 사유 변환', () => {
  it('송출자에게는 사유별 문구를, 모르는 사유에는 일반 문구를 준다', () => {
    const messages = [
      RejectionReason.InvalidKey,
      RejectionReason.AlreadyBroadcasting,
      RejectionReason.Ended,
      RejectionReason.NotFound,
    ].map((reason) => broadcasterRejectionMessage(reason))

    expect(new Set(messages).size).toBe(4)
    expect(messages).not.toContain(START_FAILURE_MESSAGE)
    expect(broadcasterRejectionMessage(RejectionReason.Full)).toBe(START_FAILURE_MESSAGE)
    expect(broadcasterRejectionMessage(null)).toBe(START_FAILURE_MESSAGE)
  })

  it('시청자에게는 종료·정원·재시도·실패로 나눈다', () => {
    expect(viewerRejection(RejectionReason.Ended)).toEqual({ action: 'ended' })
    expect(viewerRejection(RejectionReason.Full)).toEqual({ action: 'full' })
    expect(viewerRejection(RejectionReason.NotBroadcasting)).toEqual({ action: 'retry' })
    expect(viewerRejection(RejectionReason.NotFound)).toMatchObject({ action: 'fail', message: '방송을 찾을 수 없습니다.' })
    expect(viewerRejection(RejectionReason.InvalidKey)).toEqual({ action: 'fail', message: VIEW_FAILURE_MESSAGE })
    expect(viewerRejection(null)).toEqual({ action: 'fail', message: VIEW_FAILURE_MESSAGE })
  })
})
