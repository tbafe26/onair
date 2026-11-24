// 한 라이브방송의 시청 부하. 가상 시청자는 재생 목록을 주기적으로 받고 새 조각을 받는다.
// 송출 중인 라이브방송이 있어야 한다.
//   docker run --rm --network k3d-onair -v "${PWD}/load:/load" -e BROADCAST_ID=1 grafana/k6:2.4.0 run /load/hls-watch.js
// 시청자는 50 → 100 → 200 → 400명으로 늘린다. 시청자 수별 조각 응답 시간과 파드 수 변화를 본다.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://k3d-onair-serverlb'
const BROADCAST_ID = __ENV.BROADCAST_ID
const LIVE_URL = `${BASE_URL}/hls/live/${BROADCAST_ID}`
// 화면(hls.js)은 조각 길이(약 2초)마다 재생 목록을 다시 받는다. 1초마다 받아 서버 부하를 넉넉하게 본다.
const POLL_SECONDS = 1

const segments = new Counter('hls_segments')

export const options = {
  stages: [50, 100, 200, 400].flatMap((target) => [
    { duration: '30s', target },
    { duration: '90s', target },
  ]).concat([{ duration: '10s', target: 0 }]),
  thresholds: {
    'http_req_duration{name:segment}': ['p(95)<1000'],
    http_req_failed: ['rate==0'],
  },
}

// 가상 사용자마다 따로 갖는 상태: 미디어 재생 목록 주소와 이미 본 조각.
let mediaPlaylistUri
let initLoaded = false
const seen = new Set()

function get(uri, tag) {
  const res = http.get(`${LIVE_URL}/${uri}`, { tags: { name: tag } })
  check(res, { [`${tag} 200`]: (r) => r.status === 200 })
  return res
}

function lines(res) {
  return res.status === 200 ? res.body.split('\n').map((line) => line.trim()) : []
}

function uris(playlistLines) {
  return playlistLines.filter((line) => line && !line.startsWith('#'))
}

export default function () {
  if (!mediaPlaylistUri) {
    mediaPlaylistUri = uris(lines(get('index.m3u8', 'index')))[0]
    if (!mediaPlaylistUri) {
      sleep(POLL_SECONDS)
      return
    }
  }
  const playlist = lines(get(mediaPlaylistUri, 'playlist'))
  const initUri = playlist.map((line) => /^#EXT-X-MAP:URI="(.+)"$/.exec(line)?.[1]).find(Boolean)
  if (initUri && !initLoaded) {
    initLoaded = get(initUri, 'init').status === 200
  }
  // 처음 붙을 때는 플레이어처럼 끝의 조각 세 개부터 받는다.
  const segmentUris = uris(playlist)
  const newUris = seen.size === 0 ? segmentUris.slice(-3) : segmentUris.filter((uri) => !seen.has(uri))
  segmentUris.forEach((uri) => seen.add(uri))
  for (const uri of newUris) {
    if (get(uri, 'segment').status === 200) segments.add(1)
  }
  sleep(POLL_SECONDS)
}
