import type { PeerConnectionLike } from '../live/peer'

/** 테스트용 PeerConnection: 호출을 기록하고, 연결 쪽 사건은 emit 함수로 일으킨다. */
export interface FakePeer extends PeerConnectionLike {
  tracks: MediaStreamTrack[]
  localDescription: RTCSessionDescriptionInit | null
  remoteDescription: RTCSessionDescriptionInit | null
  candidates: RTCIceCandidateInit[]
  closed: boolean
  emitCandidate(candidate: RTCIceCandidateInit): void
  emitTrack(stream: MediaStream): void
  emitFailed(): void
}

export function createFakePeer(): FakePeer {
  let iceListener: (candidate: RTCIceCandidateInit) => void = () => {}
  let trackListener: (stream: MediaStream) => void = () => {}
  let failedListener: () => void = () => {}
  const peer: FakePeer = {
    tracks: [],
    localDescription: null,
    remoteDescription: null,
    candidates: [],
    closed: false,
    addTrack: (track) => void peer.tracks.push(track),
    createOffer: async () => ({ type: 'offer', sdp: 'fake-offer' }),
    createAnswer: async () => ({ type: 'answer', sdp: 'fake-answer' }),
    setLocalDescription: async (description) => void (peer.localDescription = description),
    setRemoteDescription: async (description) => void (peer.remoteDescription = description),
    addIceCandidate: async (candidate) => void peer.candidates.push(candidate),
    onIceCandidate: (listener) => void (iceListener = listener),
    onTrack: (listener) => void (trackListener = listener),
    onFailed: (listener) => void (failedListener = listener),
    close: () => void (peer.closed = true),
    emitCandidate: (candidate) => iceListener(candidate),
    emitTrack: (stream) => trackListener(stream),
    emitFailed: () => failedListener(),
  }
  return peer
}
