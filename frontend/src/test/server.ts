import { setupServer } from 'msw/node'

// 기본 핸들러는 없다. 각 테스트가 server.use(...)로 /api 응답을 정한다.
export const server = setupServer()
