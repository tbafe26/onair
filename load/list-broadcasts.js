// 방송 목록 읽기 부하. 호스트를 거치면 네트워크가 먼저 막히므로 클러스터와 같은 Docker 네트워크에서 돌린다.
//   docker run --rm --network k3d-onair -v "${PWD}/load:/load" grafana/k6:2.4.0 run /load/list-broadcasts.js
import http from 'k6/http'
import { check } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://k3d-onair-serverlb'

export const options = {
  stages: [
    { duration: '30s', target: 30 },
    { duration: '3m', target: 30 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<=500'],
    // 5xx뿐 아니라 파드가 늘고 줄 때 생기는 연결 거부·타임아웃도 실패로 센다.
    http_req_failed: ['rate==0'],
  },
}

export default function () {
  const res = http.get(`${BASE_URL}/api/broadcasts`)
  check(res, { 'status 200': (r) => r.status === 200 })
}
