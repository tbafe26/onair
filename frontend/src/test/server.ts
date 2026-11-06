import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// 기본으로 비로그인(guest)이다. 앱이 시작할 때 /api/auth/me를 부르므로 따로 정하지 않은 테스트는 로그인하지 않은 방문자로 본다.
// 그 밖의 /api 응답은 각 테스트가 server.use(...)로 정한다.
export const server = setupServer(
  http.get('/api/auth/me', () =>
    HttpResponse.json({ status: 401, title: '로그인 필요' }, { status: 401 }),
  ),
)
