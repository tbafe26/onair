import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NOT_BROADCASTING_MESSAGE,
  PLAYBACK_FAILURE_MESSAGE,
  RECOVER_LIMIT,
  RETRY_INTERVAL_MS,
  RETRY_LIMIT_MS,
  STALL_LIMIT_MS,
  createLiveViewer,
  playlistUrlOf,
  type HlsPlayback,
  type ViewerDeps,
} from './viewer'

interface FakePlayback extends HlsPlayback {
  fail(): void
  destroyed: boolean
}

function setup(overrides: Partial<ViewerDeps> = {}) {
  const playbacks: FakePlayback[] = []
  const deps: ViewerDeps = {
    playlistReady: vi.fn(async () => true),
    isOnAir: vi.fn(async () => true),
    play: vi.fn(() => {
      let onFatal = () => {}
      const playback: FakePlayback = {
        destroyed: false,
        onFatalError: (listener) => void (onFatal = listener),
        destroy: () => void (playback.destroyed = true),
        fail: () => onFatal(),
      }
      playbacks.push(playback)
      return playback
    }),
    ...overrides,
  }
  return { deps, playbacks }
}

const video = {} as HTMLVideoElement

describe('HLS 시청', () => {
  afterEach(() => vi.useRealTimers())

  it('재생 목록 주소는 미디어 서버의 경로 이름(live/방송 id)을 따른다', () => {
    expect(playlistUrlOf(7)).toBe('/hls/live/7/index.m3u8')
  })

  it('재생 목록이 준비되면 playing이 되고, 영상 요소를 붙이면 그 주소로 재생한다', async () => {
    const { deps } = setup()
    const viewer = createLiveViewer(deps, 7)

    viewer.join()
    expect(viewer.state()).toEqual({ phase: 'connecting' })
    await vi.waitFor(() => expect(viewer.state()).toEqual({ phase: 'playing', playlistUrl: '/hls/live/7/index.m3u8' }))

    viewer.attach(video)
    expect(deps.play).toHaveBeenCalledWith(video, '/hls/live/7/index.m3u8')
  })

  it('재생 목록이 아직 없으면 연결 중으로 두고 3초마다 다시 확인한다', async () => {
    vi.useFakeTimers()
    const ready = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { deps } = setup({ playlistReady: ready })
    const viewer = createLiveViewer(deps, 7)

    viewer.join()
    await vi.advanceTimersByTimeAsync(0)
    expect(viewer.state()).toEqual({ phase: 'connecting' })
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS)

    expect(ready).toHaveBeenCalledTimes(2)
    expect(viewer.state().phase).toBe('playing')
  })

  it('30초 동안 준비되지 않고 방송이 끝났으면 ended, 아직 방송 중이면 실패 문구다', async () => {
    vi.useFakeTimers()
    const ended = setup({ playlistReady: vi.fn(async () => false), isOnAir: vi.fn(async () => false) })
    const endedViewer = createLiveViewer(ended.deps, 7)
    const waiting = setup({ playlistReady: vi.fn(async () => false) })
    const waitingViewer = createLiveViewer(waiting.deps, 8)

    endedViewer.join()
    waitingViewer.join()
    await vi.advanceTimersByTimeAsync(RETRY_LIMIT_MS + RETRY_INTERVAL_MS)

    expect(endedViewer.state()).toEqual({ phase: 'ended' })
    expect(waitingViewer.state()).toEqual({ phase: 'failed', message: NOT_BROADCASTING_MESSAGE })
  })

  it('재생 목록 확인 요청이 실패해도 준비되지 않은 것으로 보고 다시 확인한다', async () => {
    vi.useFakeTimers()
    const ready = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(true)
    const { deps } = setup({ playlistReady: ready })
    const viewer = createLiveViewer(deps, 7)

    viewer.join()
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS)

    expect(viewer.state().phase).toBe('playing')
  })

  it('재생이 멈출 만큼 실패했을 때 방송이 끝났으면 ended가 되고 재생을 정리한다', async () => {
    const { deps, playbacks } = setup({ isOnAir: vi.fn(async () => false) })
    const viewer = createLiveViewer(deps, 7)
    viewer.join()
    await vi.waitFor(() => expect(viewer.state().phase).toBe('playing'))
    viewer.attach(video)

    playbacks[0].fail()

    await vi.waitFor(() => expect(viewer.state()).toEqual({ phase: 'ended' }))
    expect(playbacks[0].destroyed).toBe(true)
  })

  it('재생이 실패했지만 아직 방송 중이면 처음부터 다시 연결한다', async () => {
    const { deps, playbacks } = setup()
    const viewer = createLiveViewer(deps, 7)
    viewer.join()
    await vi.waitFor(() => expect(viewer.state().phase).toBe('playing'))
    viewer.attach(video)

    playbacks[0].fail()
    await vi.waitFor(() => expect(deps.playlistReady).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(viewer.state().phase).toBe('playing'))
    viewer.attach(video)

    expect(playbacks).toHaveLength(2)
    expect(playbacks[0].destroyed).toBe(true)
  })

  it('방송 중인데 다시 연결해도 재생이 계속 실패하면 3번 뒤에는 실패 문구로 멈춘다', async () => {
    const { deps, playbacks } = setup()
    const viewer = createLiveViewer(deps, 7)
    viewer.join()

    for (let attempt = 0; attempt < RECOVER_LIMIT; attempt++) {
      await vi.waitFor(() => expect(viewer.state().phase).toBe('playing'))
      viewer.attach(video)
      playbacks[attempt].fail()
      await vi.waitFor(() => expect(deps.playlistReady).toHaveBeenCalledTimes(attempt + 2))
    }
    await vi.waitFor(() => expect(viewer.state().phase).toBe('playing'))
    viewer.attach(video)
    playbacks[RECOVER_LIMIT].fail()

    await vi.waitFor(() => expect(viewer.state()).toEqual({ phase: 'failed', message: PLAYBACK_FAILURE_MESSAGE }))
    expect(deps.playlistReady).toHaveBeenCalledTimes(RECOVER_LIMIT + 1)
  })

  it('방송 상태를 알 수 없으면 실패 문구다', async () => {
    const { deps, playbacks } = setup({ isOnAir: vi.fn(async () => Promise.reject(new Error('network'))) })
    const viewer = createLiveViewer(deps, 7)
    viewer.join()
    await vi.waitFor(() => expect(viewer.state().phase).toBe('playing'))
    viewer.attach(video)

    playbacks[0].fail()

    await vi.waitFor(() => expect(viewer.state()).toEqual({ phase: 'failed', message: PLAYBACK_FAILURE_MESSAGE }))
  })

  it.each([
    ['재생 중인데 시간이 흐르지 않는다', { currentTime: 5, paused: false, readyState: 2 }],
    ['데이터를 하나도 받지 못해 멈춰 있다', { currentTime: 0, paused: true, readyState: 0 }],
  ])('영상이 10초 동안 멈춰 있으면(%s) 재생 실패로 보고 방송 상태를 확인한다', async (_case, element) => {
    vi.useFakeTimers()
    const isOnAir = vi.fn(async () => true)
    const { deps, playbacks } = setup({ isOnAir })
    const viewer = createLiveViewer(deps, 7)
    const stalled = { ...element } as unknown as HTMLVideoElement
    viewer.join()
    await vi.advanceTimersByTimeAsync(0)
    viewer.attach(stalled)

    await vi.advanceTimersByTimeAsync(STALL_LIMIT_MS - 2000)
    expect(isOnAir).not.toHaveBeenCalled()
    isOnAir.mockResolvedValue(false)
    await vi.advanceTimersByTimeAsync(2000)

    expect(viewer.state()).toEqual({ phase: 'ended' })
    expect(playbacks[0].destroyed).toBe(true)
  })

  it('영상이 흐르거나 사용자가 일시정지했으면 멈춘 것으로 보지 않는다', async () => {
    vi.useFakeTimers()
    const { deps } = setup()
    const viewer = createLiveViewer(deps, 7)
    const flowing = { currentTime: 0, paused: false, readyState: 4 }
    viewer.join()
    await vi.advanceTimersByTimeAsync(0)
    viewer.attach(flowing as unknown as HTMLVideoElement)

    for (let second = 0; second < 15; second++) {
      flowing.currentTime += 1
      await vi.advanceTimersByTimeAsync(1000)
    }
    flowing.paused = true
    await vi.advanceTimersByTimeAsync(STALL_LIMIT_MS * 2)

    expect(deps.isOnAir).not.toHaveBeenCalled()
    expect(viewer.state().phase).toBe('playing')
  })

  it('방송 중이라 실패 문구를 보여 준 뒤에도 3초마다 방송 상태를 확인해 끝나면 ended가 된다', async () => {
    vi.useFakeTimers()
    const isOnAir = vi.fn(async () => true)
    const { deps } = setup({ playlistReady: vi.fn(async () => false), isOnAir })
    const viewer = createLiveViewer(deps, 7)
    viewer.join()
    await vi.advanceTimersByTimeAsync(RETRY_LIMIT_MS + RETRY_INTERVAL_MS)
    expect(viewer.state()).toEqual({ phase: 'failed', message: NOT_BROADCASTING_MESSAGE })

    isOnAir.mockResolvedValue(false)
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS)

    expect(viewer.state()).toEqual({ phase: 'ended' })
  })

  it('같은 영상 요소를 다시 붙여도 재생을 하나만 만든다', async () => {
    const { deps } = setup()
    const viewer = createLiveViewer(deps, 7)
    viewer.join()
    await vi.waitFor(() => expect(viewer.state().phase).toBe('playing'))

    viewer.attach(video)
    viewer.attach(video)

    expect(deps.play).toHaveBeenCalledTimes(1)
  })

  it('화면을 떠나면 재생을 정리하고, 늦게 온 확인 결과와 예약한 확인은 무시한다', async () => {
    vi.useFakeTimers()
    let resolveReady: (ready: boolean) => void = () => {}
    const { deps, playbacks } = setup()
    const viewer = createLiveViewer(deps, 7)
    viewer.join()
    await vi.advanceTimersByTimeAsync(0)
    viewer.attach(video)

    viewer.dispose()
    expect(playbacks[0].destroyed).toBe(true)

    deps.playlistReady = vi.fn(() => new Promise<boolean>((resolve) => (resolveReady = resolve)))
    const late = createLiveViewer(deps, 8)
    late.join()
    late.dispose()
    resolveReady(true)
    await vi.advanceTimersByTimeAsync(RETRY_LIMIT_MS)
    expect(late.state()).toEqual({ phase: 'connecting' })
    expect(deps.play).toHaveBeenCalledTimes(1)
  })

  it('상태가 바뀔 때마다 구독자에게 알리고, 구독을 풀면 알리지 않는다', async () => {
    const { deps } = setup()
    const viewer = createLiveViewer(deps, 7)
    const listener = vi.fn()
    const unsubscribe = viewer.subscribe(listener)

    viewer.join()
    await vi.waitFor(() => expect(viewer.state().phase).toBe('playing'))
    const calls = listener.mock.calls.length
    unsubscribe()
    viewer.dispose()
    viewer.join()

    expect(calls).toBeGreaterThan(0)
    expect(listener).toHaveBeenCalledTimes(calls)
  })
})
