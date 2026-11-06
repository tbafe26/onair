// PeerConnection의 얇은 접점. 송출·시청 모듈은 이 모양만 알고, 실제 RTCPeerConnection은 바깥에서 주입한다.

export interface PeerConnectionLike {
  addTrack(track: MediaStreamTrack, stream: MediaStream): void
  createOffer(): Promise<RTCSessionDescriptionInit>
  createAnswer(): Promise<RTCSessionDescriptionInit>
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>
  onIceCandidate(listener: (candidate: RTCIceCandidateInit) => void): void
  onTrack(listener: (stream: MediaStream) => void): void
  /** 연결이 복구되지 않을 만큼 실패했다. */
  onFailed(listener: () => void): void
  close(): void
}

/**
 * 브라우저의 RTCPeerConnection을 PeerConnectionLike로 감싼다.
 * 같은 Wi-Fi 안에서만 쓰므로 STUN/TURN 서버 목록은 비워 둔다.
 */
export function createBrowserPeerConnection(): PeerConnectionLike {
  const connection = new RTCPeerConnection({ iceServers: [] })
  return {
    addTrack: (track, stream) => void connection.addTrack(track, stream),
    createOffer: () => connection.createOffer(),
    createAnswer: () => connection.createAnswer(),
    setLocalDescription: (description) => connection.setLocalDescription(description),
    setRemoteDescription: (description) => connection.setRemoteDescription(description),
    addIceCandidate: (candidate) => connection.addIceCandidate(candidate),
    onIceCandidate(listener) {
      connection.addEventListener('icecandidate', (event) => {
        if (event.candidate) listener(event.candidate.toJSON())
      })
    },
    onTrack(listener) {
      connection.addEventListener('track', (event) => {
        const [stream] = event.streams
        if (stream) listener(stream)
      })
    },
    onFailed(listener) {
      connection.addEventListener('connectionstatechange', () => {
        if (connection.connectionState === 'failed') listener()
      })
    },
    close: () => connection.close(),
  }
}
