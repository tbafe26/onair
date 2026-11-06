import { http, HttpResponse } from 'msw'
import { server } from './server'

/** 이 테스트에서는 로그인한 사용자로 앱이 시작되게 한다. */
export function signedInAs(nickname = '방송러', loginId = 'streamer01') {
  server.use(http.get('/api/auth/me', () => HttpResponse.json({ id: 1, loginId, nickname })))
}

/** 목록 화면(/)이 쓰는 빈 목록 응답. 로그인 뒤 목록으로 돌아가는지 볼 때 쓴다. */
export function emptyBroadcastList() {
  server.use(http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })))
}
