import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server'

// MSW가 처리하지 않은 /api 요청은 테스트 실패로 드러낸다.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
