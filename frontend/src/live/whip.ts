// WHIP(WebRTC-HTTP Ingestion Protocol)으로 카메라 영상을 미디어 서버에 보낸다.
// offer SDP를 HTTP POST로 보내고 answer SDP를 받는 한 번의 교환이다. 송출 키는 Authorization 헤더로만 보낸다.
import type { Publication } from './broadcaster'

/** 미디어 서버의 경로 이름은 live/{방송 id}다. 백엔드의 송출 인증이 같은 모양을 기대한다. */
export function whipUrlOf(broadcastId: number) {
  return `/live/${broadcastId}/whip`
}

// 후보 수집이 끝나기를 이만큼만 기다린다. 같은 PC·같은 네트워크의 호스트 후보는 곧바로 모인다.
const ICE_GATHERING_TIMEOUT_MS = 2000

function iceGatheringComplete(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ICE_GATHERING_TIMEOUT_MS)
    connection.addEventListener('icegatheringstatechange', () => {
      if (connection.iceGatheringState === 'complete') {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

// HLS는 VP8을 담지 못한다. 브라우저 기본값(VP8)이 아니라 H.264를 먼저 고르게 해야 미디어 서버가 다시 인코딩하지 않고 HLS로 담는다.
function preferH264(transceiver: RTCRtpTransceiver) {
  const codecs = RTCRtpReceiver.getCapabilities?.('video')?.codecs
  if (!codecs || !transceiver.setCodecPreferences) return
  const h264 = codecs.filter((codec) => codec.mimeType.toLowerCase() === 'video/h264')
  if (h264.length === 0) return
  transceiver.setCodecPreferences([...h264, ...codecs.filter((codec) => !h264.includes(codec))])
}

export async function publishWhip(broadcastId: number, streamKey: string, stream: MediaStream): Promise<Publication> {
  const connection = new RTCPeerConnection({ iceServers: [] })
  try {
    for (const track of stream.getTracks()) {
      const transceiver = connection.addTransceiver(track, { direction: 'sendonly', streams: [stream] })
      if (track.kind === 'video') preferH264(transceiver)
    }
    await connection.setLocalDescription(await connection.createOffer())
    await iceGatheringComplete(connection)
    const response = await fetch(whipUrlOf(broadcastId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${streamKey}` },
      body: connection.localDescription?.sdp ?? '',
    })
    if (!response.ok) throw new Error(`WHIP ${response.status}`)
    await connection.setRemoteDescription({ type: 'answer', sdp: await response.text() })
    const session = response.headers.get('Location')
    return {
      onFailed(listener) {
        connection.addEventListener('connectionstatechange', () => {
          if (connection.connectionState === 'failed') listener()
        })
      },
      close() {
        connection.close()
        // 미디어 서버에 송출이 끝났음을 바로 알린다. 실패해도 연결이 끊기면 미디어 서버가 스스로 정리한다.
        if (session) void fetch(session, { method: 'DELETE' }).catch(() => {})
      },
    }
  } catch (error) {
    connection.close()
    throw error
  }
}
