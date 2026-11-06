import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { browserLive } from './browser-live'
import { LiveProvider } from './LiveProvider'
import { useLive, type Live } from './live-context'

it('값을 주지 않으면 실제 브라우저 모듈을 준다', () => {
  const { result } = renderHook(() => useLive(), { wrapper: LiveProvider })

  expect(result.current).toBe(browserLive)
})

it('값을 주면 그것을 준다', () => {
  const live: Live = { createBroadcaster: vi.fn(), createViewer: vi.fn(), createChat: vi.fn() }

  const { result } = renderHook(() => useLive(), {
    wrapper: ({ children }) => <LiveProvider live={live}>{children}</LiveProvider>,
  })

  expect(result.current).toBe(live)
})

it('LiveProvider 밖에서는 쓸 수 없다', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  expect(() => renderHook(() => useLive())).toThrow('LiveProvider')
})
