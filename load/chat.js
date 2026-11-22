// 한 라이브방송의 채팅 부하. 쓰는 사람은 REST로 댓글을 쓰고, 구독자는 채팅 WebSocket으로 받는다.
// 방송 중인 라이브방송이 있어야 한다(송출이 없으면 서버가 30초 뒤 종료한다).
//   docker run --rm --network k3d-onair -v "${PWD}/load:/load" -e BROADCAST_ID=1 grafana/k6:2.4.0 run /load/chat.js
// MODE=throughput: 쓰기 속도를 단계적으로 올려 파드 1개가 버티는 초당 채팅 수를 찾는다.
// MODE=steady(기본): 정해진 속도로 DURATION 동안 쓰고 받는다. 서버가 늘고 줄 때 재연결과 빠진 채팅을 본다.
import http from 'k6/http'
import { check } from 'k6'
import { Counter, Trend } from 'k6/metrics'
import { WebSocket } from 'k6/websockets'
import { setTimeout, clearTimeout } from 'k6/timers'

const BASE_URL = __ENV.BASE_URL || 'http://k3d-onair-serverlb'
const WS_URL = BASE_URL.replace(/^http/, 'ws')
const BROADCAST_ID = __ENV.BROADCAST_ID
// 채팅 WebSocket은 허용 Origin만 받는다. 클러스터는 입구 주소(k8s/backend.yaml의 ALLOWED_ORIGINS)를 허용한다.
const ORIGIN = __ENV.ORIGIN || 'http://localhost:8088'
const MODE = __ENV.MODE || 'steady'
const SUBSCRIBERS = Number(__ENV.SUBSCRIBERS || 50)
const RATE = Number(__ENV.RATE || 5)
// 가입은 비밀번호 해시로 CPU를 많이 쓰므로 시작 전에 이만큼만 하고 세션을 나눠 쓴다.
const WRITERS = Number(__ENV.WRITERS || 20)
const DURATION = __ENV.DURATION || '12m'
// 화면(chat.ts)과 같은 값: 고정 3초 뒤 재연결, 빠진 채팅은 최신순 최대 10쪽까지 채운다.
const RECONNECT_DELAY_MS = 3000
const MAX_BACKFILL_PAGES = 10

const delivery = new Trend('chat_delivery', true)
const reconnects = new Counter('chat_reconnects')
const backfillRequests = new Counter('chat_backfill_requests')
const backfilled = new Counter('chat_backfilled')
const gaps = new Counter('chat_gaps')
const ended = new Counter('chat_ended')

const throughputStages = [10, 20, 40, 60, 80, 100, 120].map((target) => ({ target, duration: '1m' }))
// 쓰기는 30초 뒤 시작하고, 구독은 쓰기가 끝난 뒤 30초 더 받는다.
const WRITE_MS = MODE === 'throughput' ? throughputStages.length * 60000 : toMillis(DURATION)
const SUBSCRIBE_MS = WRITE_MS + 60000

function toMillis(text) {
  const value = Number(text.slice(0, -1))
  return text.endsWith('m') ? value * 60000 : value * 1000
}

export const options = {
  scenarios: {
    subscribers: {
      executor: 'constant-vus',
      exec: 'subscribe',
      vus: SUBSCRIBERS,
      duration: `${SUBSCRIBE_MS / 1000}s`,
      gracefulStop: '10s',
    },
    writers: MODE === 'throughput'
      ? {
          executor: 'ramping-arrival-rate',
          exec: 'write',
          startTime: '30s',
          startRate: 5,
          timeUnit: '1s',
          stages: throughputStages,
          preAllocatedVUs: 50,
          maxVUs: 200,
        }
      : {
          executor: 'constant-arrival-rate',
          exec: 'write',
          startTime: '30s',
          rate: RATE,
          timeUnit: '1s',
          duration: DURATION,
          preAllocatedVUs: 20,
          maxVUs: 100,
        },
  },
  thresholds: {
    chat_delivery: ['p(95)<1000'],
    http_req_failed: ['rate==0'],
    chat_gaps: ['count==0'],
  },
}

export function setup() {
  const sessions = []
  for (let i = 0; i < WRITERS; i += 1) {
    const jar = new http.CookieJar()
    http.get(`${BASE_URL}/api/broadcasts?size=1`, { jar })
    const res = http.post(
      `${BASE_URL}/api/auth/signup`,
      JSON.stringify({ loginId: `k6w${i}x${Date.now().toString(36)}`.slice(0, 20), password: 'load-test-pass', nickname: `부하${i}` }),
      { jar, headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': cookie(jar, 'XSRF-TOKEN') } },
    )
    check(res, { 'signup 201': (r) => r.status === 201 })
    sessions.push(jar.cookiesForURL(BASE_URL))
  }
  return { sessions }
}

function cookie(jar, name) {
  const values = jar.cookiesForURL(BASE_URL)[name]
  return values ? values[0] : ''
}

// k6는 반복마다 가상 사용자의 쿠키를 비우므로 매번 세션을 다시 넣는다.
function useSession(sessions) {
  const jar = http.cookieJar()
  const cookies = sessions[__VU % sessions.length]
  for (const name of Object.keys(cookies)) jar.set(BASE_URL, name, cookies[name][0])
}

export function write(data) {
  useSession(data.sessions)
  const res = http.post(
    `${BASE_URL}/api/broadcasts/${BROADCAST_ID}/comments`,
    JSON.stringify({ content: `t=${Date.now()}` }),
    {
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': cookie(http.cookieJar(), 'XSRF-TOKEN') },
      tags: { name: 'comment' },
    },
  )
  check(res, { 'comment 201': (r) => r.status === 201 })
}

function sentAt(content) {
  const match = /^t=(\d+)$/.exec(content)
  return match ? Number(match[1]) : null
}

/** 마지막으로 받은 댓글 뒤의 것을 최신순 쪽으로 거슬러 받는다(chat.ts의 채우기와 같은 방식). */
function backfill(lastId, received) {
  let before
  for (let page = 0; page < MAX_BACKFILL_PAGES; page += 1) {
    const query = before === undefined ? '' : `?before=${before}`
    const res = http.get(`${BASE_URL}/api/broadcasts/${BROADCAST_ID}/comments${query}`, { tags: { name: 'backfill' } })
    backfillRequests.add(1)
    if (res.status !== 200) return
    const body = res.json()
    for (const comment of body.items) {
      if (comment.id > lastId && !received.has(comment.id)) {
        received.add(comment.id)
        backfilled.add(1)
      }
    }
    if (body.items.some((comment) => comment.id <= lastId) || body.nextCursor === null) return
    before = body.nextCursor
  }
}

export function subscribe() {
  const received = new Set()
  let lastId = 0
  let stopped = false
  let socket
  let retry

  setTimeout(() => {
    stopped = true
    if (retry) clearTimeout(retry)
    if (socket) socket.close()
    countGaps(received)
  }, SUBSCRIBE_MS)

  function connect(reconnecting) {
    socket = new WebSocket(`${WS_URL}/api/broadcasts/${BROADCAST_ID}/chat`, null, { headers: { Origin: ORIGIN } })
    socket.onopen = () => {
      if (!reconnecting) return
      reconnects.add(1)
      console.log(`reconnect ${Date.now()}`)
      backfill(lastId, received)
      for (const id of received) lastId = Math.max(lastId, id)
    }
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type === 'ended') {
        // 화면처럼 종료 신호를 받으면 다시 붙지 않는다.
        ended.add(1)
        stopped = true
        socket.close()
        return
      }
      if (message.type !== 'comment') return
      const { id, content } = message.comment
      const at = sentAt(content)
      if (at !== null && !received.has(id)) delivery.add(Date.now() - at)
      received.add(id)
      lastId = Math.max(lastId, id)
    }
    socket.onclose = () => {
      if (stopped) return
      retry = setTimeout(() => connect(true), RECONNECT_DELAY_MS)
    }
    socket.onerror = () => {}
  }

  connect(false)
}

/** 처음 받은 댓글부터 마지막까지 사이에 빠진 번호를 센다. 이 방송에만 댓글을 쓰므로 번호는 이어진다. */
function countGaps(received) {
  if (received.size === 0) return
  let min = Infinity
  let max = -Infinity
  for (const id of received) {
    min = Math.min(min, id)
    max = Math.max(max, id)
  }
  gaps.add(max - min + 1 - received.size)
}

