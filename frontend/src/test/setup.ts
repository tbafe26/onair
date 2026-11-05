import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { installFakeIntersectionObserver } from './intersection'
import { server } from './server'

// Gradle 빌드와 동시에 도는 등 느린 환경에서도 findBy·waitFor가 흔들리지 않게 기다리는 시간을 늘린다.
// testTimeout(vite.config.ts, 20초)보다 짧아야 한다.
configure({ asyncUtilTimeout: 10_000 })

installFakeIntersectionObserver()

// MSW가 처리하지 않은 /api 요청은 테스트 실패로 드러낸다.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
