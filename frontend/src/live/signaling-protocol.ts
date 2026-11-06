// 시그널링 프로토콜. 메시지 종류, 수신 메시지 판별, 거절 사유별 화면 상태·문구를 한곳에 모은다.
// 문자열은 contracts/signaling.json과 같아야 하고, signaling-protocol.test.ts가 대조한다.

export const MessageType = {
  JoinBroadcaster: 'join-broadcaster',
  JoinViewer: 'join-viewer',
  Joined: 'joined',
  Rejected: 'rejected',
  End: 'end',
  Heartbeat: 'heartbeat',
  Ended: 'ended',
  Offer: 'offer',
  Answer: 'answer',
  Candidate: 'candidate',
  ViewerJoined: 'viewer-joined',
  ViewerLeft: 'viewer-left',
  ViewerCount: 'viewer-count',
} as const

export const RejectionReason = {
  NotOwner: 'not-owner',
  InvalidKey: 'invalid-key',
  AlreadyBroadcasting: 'already-broadcasting',
  Ended: 'ended',
  NotFound: 'not-found',
  NotBroadcasting: 'not-broadcasting',
  AlreadyJoined: 'already-joined',
  Full: 'full',
} as const

export type RejectionReason = (typeof RejectionReason)[keyof typeof RejectionReason]

/** 선로 위의 메시지. 모양은 아래 판별 함수로만 좁힌다. */
export interface SignalMessage {
  type: string
  [field: string]: unknown
}

export interface SignalingChannel {
  send(message: SignalMessage): void
  close(): void
}

export interface SignalingHandlers {
  onMessage(message: SignalMessage): void
  /** 서버가 닫았거나 연결이 끊겼다. close()를 직접 부른 경우에는 호출하지 않는다. */
  onClose(): void
}

/** JSON으로 읽은 값이 type을 가진 메시지인지 가린다. */
export function asSignalMessage(value: unknown): SignalMessage | null {
  if (typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string') {
    return value as SignalMessage
  }
  return null
}

// 보내는 메시지

export const joinBroadcaster = (streamKey: string): SignalMessage => ({ type: MessageType.JoinBroadcaster, streamKey })
export const joinViewer = (): SignalMessage => ({ type: MessageType.JoinViewer })
export const heartbeat = (): SignalMessage => ({ type: MessageType.Heartbeat })
export const endBroadcast = (): SignalMessage => ({ type: MessageType.End })
export const offerTo = (viewerId: string, sdp: string | undefined): SignalMessage => ({
  type: MessageType.Offer,
  to: viewerId,
  sdp,
})
export const candidateTo = (viewerId: string, candidate: RTCIceCandidateInit): SignalMessage => ({
  type: MessageType.Candidate,
  to: viewerId,
  candidate,
})
export const answerFromViewer = (sdp: string | undefined): SignalMessage => ({ type: MessageType.Answer, sdp })
export const candidateFromViewer = (candidate: RTCIceCandidateInit): SignalMessage => ({
  type: MessageType.Candidate,
  candidate,
})

// 받는 메시지

function reasonOf(message: SignalMessage): RejectionReason | null {
  return Object.values(RejectionReason).find((reason) => reason === message.reason) ?? null
}

function iceCandidateOf(message: SignalMessage): RTCIceCandidateInit | null {
  return typeof message.candidate === 'object' && message.candidate !== null
    ? (message.candidate as RTCIceCandidateInit)
    : null
}

/** 송출자가 서버에서 받는 메시지. reason은 모르는 값이면 null이다. */
export type BroadcasterInbound =
  | { type: typeof MessageType.Joined }
  | { type: typeof MessageType.Rejected; reason: RejectionReason | null }
  | { type: typeof MessageType.Ended }
  | { type: typeof MessageType.ViewerCount; count: number; max: number | null }
  | { type: typeof MessageType.ViewerJoined; viewerId: string }
  | { type: typeof MessageType.ViewerLeft; viewerId: string }
  | { type: typeof MessageType.Answer; viewerId: string; sdp: string }
  | { type: typeof MessageType.Candidate; viewerId: string; candidate: RTCIceCandidateInit }

/** 모르는 종류이거나 필요한 필드가 없으면 null이다. */
export function parseBroadcasterInbound(message: SignalMessage): BroadcasterInbound | null {
  switch (message.type) {
    case MessageType.Joined:
      return { type: MessageType.Joined }
    case MessageType.Rejected:
      return { type: MessageType.Rejected, reason: reasonOf(message) }
    case MessageType.Ended:
      return { type: MessageType.Ended }
    case MessageType.ViewerCount:
      return typeof message.count === 'number'
        ? { type: MessageType.ViewerCount, count: message.count, max: typeof message.max === 'number' ? message.max : null }
        : null
    case MessageType.ViewerJoined:
    case MessageType.ViewerLeft:
      return typeof message.viewerId === 'string' ? { type: message.type, viewerId: message.viewerId } : null
    case MessageType.Answer:
      return typeof message.from === 'string' && typeof message.sdp === 'string'
        ? { type: MessageType.Answer, viewerId: message.from, sdp: message.sdp }
        : null
    case MessageType.Candidate: {
      const candidate = iceCandidateOf(message)
      return typeof message.from === 'string' && candidate
        ? { type: MessageType.Candidate, viewerId: message.from, candidate }
        : null
    }
    default:
      return null
  }
}

/** 시청자가 서버에서 받는 메시지. */
export type ViewerInbound =
  | { type: typeof MessageType.Rejected; reason: RejectionReason | null }
  | { type: typeof MessageType.Ended }
  | { type: typeof MessageType.Offer; sdp: string }
  | { type: typeof MessageType.Candidate; candidate: RTCIceCandidateInit }

export function parseViewerInbound(message: SignalMessage): ViewerInbound | null {
  switch (message.type) {
    case MessageType.Rejected:
      return { type: MessageType.Rejected, reason: reasonOf(message) }
    case MessageType.Ended:
      return { type: MessageType.Ended }
    case MessageType.Offer:
      return typeof message.sdp === 'string' ? { type: MessageType.Offer, sdp: message.sdp } : null
    case MessageType.Candidate: {
      const candidate = iceCandidateOf(message)
      return candidate ? { type: MessageType.Candidate, candidate } : null
    }
    default:
      return null
  }
}

// 거절 사유별 화면 상태와 문구

export const START_FAILURE_MESSAGE = '송출을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
export const VIEW_FAILURE_MESSAGE = '연결하지 못했습니다. 잠시 뒤 새로고침해 다시 시도해 주세요.'
export const VIEW_NOT_FOUND_MESSAGE = '방송을 찾을 수 없습니다.'
export const VIEW_NOT_BROADCASTING_MESSAGE = '송출이 아직 연결되지 않았습니다. 잠시 뒤 새로고침해 다시 시도해 주세요.'
export const VIEW_ALREADY_JOINED_MESSAGE = '이미 이 방송을 보고 있는 연결이 있습니다.'

/** 송출 시작이 거절되었을 때 사용자에게 보여 줄 문구. */
export function broadcasterRejectionMessage(reason: RejectionReason | null): string {
  switch (reason) {
    case RejectionReason.NotOwner:
      return '이 방송의 소유자만 송출할 수 있습니다. 방송을 등록한 계정으로 로그인해 주세요.'
    case RejectionReason.InvalidKey:
      return '송출 키가 맞지 않아 송출을 시작하지 못했습니다.'
    case RejectionReason.AlreadyBroadcasting:
      return '이미 다른 곳에서 송출 중인 방송입니다.'
    case RejectionReason.Ended:
      return '이미 종료된 방송이라 송출을 시작하지 못했습니다.'
    case RejectionReason.NotFound:
      return '방송을 찾을 수 없어 송출을 시작하지 못했습니다.'
    default:
      return START_FAILURE_MESSAGE
  }
}

/** 시청 접속이 거절되었을 때 화면이 할 일. retry는 송출이 연결되기를 기다리며 다시 접속한다는 뜻이다. */
export type ViewerRejection =
  | { action: 'ended' }
  | { action: 'full' }
  | { action: 'retry' }
  | { action: 'fail'; message: string }

export function viewerRejection(reason: RejectionReason | null): ViewerRejection {
  switch (reason) {
    case RejectionReason.Ended:
      return { action: 'ended' }
    case RejectionReason.Full:
      return { action: 'full' }
    case RejectionReason.NotBroadcasting:
      return { action: 'retry' }
    case RejectionReason.NotFound:
      return { action: 'fail', message: VIEW_NOT_FOUND_MESSAGE }
    case RejectionReason.AlreadyJoined:
      return { action: 'fail', message: VIEW_ALREADY_JOINED_MESSAGE }
    default:
      return { action: 'fail', message: VIEW_FAILURE_MESSAGE }
  }
}
