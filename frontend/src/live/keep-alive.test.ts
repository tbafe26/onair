import { describe, expect, it, vi } from 'vitest'
import { createKeepAlive, type KeepAliveDeps } from './keep-alive'

function setup(overrides: Partial<KeepAliveDeps> = {}) {
  const releases: ReturnType<typeof vi.fn>[] = []
  const requestWakeLock = vi.fn(async () => {
    const release = vi.fn(async () => undefined)
    releases.push(release)
    return { release }
  })
  let onVisible = () => {}
  const unwatch = vi.fn()
  const watchVisible = vi.fn((listener: () => void) => {
    onVisible = listener
    return unwatch
  })
  const keepAlive = createKeepAlive({ requestWakeLock, watchVisible, ...overrides })
  return { keepAlive, requestWakeLock, releases, watchVisible, unwatch, visible: () => onVisible() }
}

describe('연결 유지', () => {
  describe('화면 꺼짐 방지', () => {
    it('시작하면 잠금을 요청하고, 멈추면 푼다', async () => {
      const { keepAlive, requestWakeLock, releases } = setup()

      keepAlive.start()
      await vi.waitFor(() => expect(requestWakeLock).toHaveBeenCalledTimes(1))
      await Promise.resolve()
      expect(releases[0]).not.toHaveBeenCalled()

      keepAlive.stop()
      expect(releases[0]).toHaveBeenCalled()
    })

    it('지원하지 않는 브라우저에서는 시작과 멈춤이 아무 일도 하지 않는다', () => {
      const { keepAlive } = setup({ requestWakeLock: undefined, watchVisible: undefined })

      expect(() => {
        keepAlive.start()
        keepAlive.stop()
      }).not.toThrow()
    })

    it('요청이 거절돼도 오류 없이 넘어가고, 두 번 시작해도 요청은 한 번이다', async () => {
      const requestWakeLock = vi.fn(async () => Promise.reject(new Error('denied')))
      const { keepAlive } = setup({ requestWakeLock })

      keepAlive.start()
      keepAlive.start()
      await vi.waitFor(() => expect(requestWakeLock).toHaveBeenCalled())
      keepAlive.stop()

      expect(requestWakeLock).toHaveBeenCalledTimes(1)
    })

    it('화면이 다시 보이면 잠금을 다시 요청하고, 멈추면 구독을 푼다', async () => {
      const { keepAlive, requestWakeLock, visible, unwatch } = setup()
      keepAlive.start()
      await vi.waitFor(() => expect(requestWakeLock).toHaveBeenCalledTimes(1))

      visible()
      await vi.waitFor(() => expect(requestWakeLock).toHaveBeenCalledTimes(2))

      keepAlive.stop()
      expect(unwatch).toHaveBeenCalled()
    })

    it('이전 잠금은 새 잠금으로 바꿀 때 풀고, 새 잠금은 멈출 때 푼다', async () => {
      const { keepAlive, requestWakeLock, releases, visible } = setup()
      keepAlive.start()
      await vi.waitFor(() => expect(requestWakeLock).toHaveBeenCalledTimes(1))
      visible()
      await vi.waitFor(() => expect(releases[0]).toHaveBeenCalled())
      expect(releases[1]).not.toHaveBeenCalled()

      keepAlive.stop()

      expect(releases[1]).toHaveBeenCalled()
    })

    it('시작하기 전이나 멈춘 뒤에는 화면이 보여도 요청하지 않는다', async () => {
      const { keepAlive, requestWakeLock, visible } = setup()

      visible()
      expect(requestWakeLock).not.toHaveBeenCalled()

      keepAlive.start()
      await vi.waitFor(() => expect(requestWakeLock).toHaveBeenCalledTimes(1))
      keepAlive.stop()
      visible()
      expect(requestWakeLock).toHaveBeenCalledTimes(1)
    })

    it('멈춘 뒤에 늦게 받은 잠금도 바로 푼다', async () => {
      let grant: (lock: { release: () => Promise<void> }) => void = () => {}
      const release = vi.fn(async () => undefined)
      const requestWakeLock = vi.fn(() => new Promise<{ release: () => Promise<void> }>((resolve) => (grant = resolve)))
      const { keepAlive } = setup({ requestWakeLock })
      keepAlive.start()
      keepAlive.stop()

      grant({ release })
      await Promise.resolve()

      expect(release).toHaveBeenCalled()
    })
  })
})
