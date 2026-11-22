// 시청 모듈. React와 무관하고, 재생 목록 확인·방송 상태 확인·HLS 재생은 바깥에서 받는다(deps).
// 미디어 서버가 쓴 HLS 재생 목록을 백엔드가 /hls/로 내주고, 이 모듈은 그것이 준비될 때까지 기다렸다가 재생한다.

export type ViewerState =
  | { phase: 'connecting' }
  | { phase: 'playing'; playlistUrl: string }
  | { phase: 'ended' }
  /** message는 화면에 그대로 보여 줄 실패 이유다. */
  | { phase: 'failed'; message: string }

export const PLAYBACK_FAILURE_MESSAGE = '영상을 불러오지 못했습니다. 잠시 뒤 새로고침해 다시 시도해 주세요.'
export const NOT_BROADCASTING_MESSAGE = '송출이 아직 시작되지 않았습니다. 잠시 뒤 새로고침해 다시 시도해 주세요.'

/** 영상 요소 하나에 붙은 HLS 재생. */
export interface HlsPlayback {
  /** 다시 시도해도 이어지지 않을 만큼 재생이 실패했다. */
  onFatalError(listener: () => void): void
  destroy(): void
}

export interface ViewerDeps {
  /** 재생 목록이 준비됐는지 본다. */
  playlistReady(url: string): Promise<boolean>
  isOnAir(broadcastId: number): Promise<boolean>
  play(video: HTMLVideoElement, url: string): HlsPlayback
  /** 일정 시간 뒤에 callback을 부른다. 돌려주는 함수로 취소한다. 없으면 setTimeout을 쓴다. */
  schedule?: (callback: () => void, delayMs: number) => () => void
}

/** 방송 시작 직후에는 미디어 서버가 첫 조각을 쓰기 전이라 이 간격으로 다시 보고, 이 시간이 지나면 포기한다. */
export const RETRY_INTERVAL_MS = 3000
export const RETRY_LIMIT_MS = 30_000
const MAX_RETRIES = RETRY_LIMIT_MS / RETRY_INTERVAL_MS
/** 방송 중인데 재생이 계속 실패하면(예: 이 브라우저가 못 푸는 영상) 이만큼 다시 연결한 뒤 멈춘다. */
export const RECOVER_LIMIT = 3

/** 미디어 서버의 경로 이름은 live/{방송 id}이고, 백엔드가 그 폴더를 /hls/ 아래로 내준다. */
export function playlistUrlOf(broadcastId: number) {
  return `/hls/live/${broadcastId}/index.m3u8`
}

function defaultSchedule(callback: () => void, delayMs: number) {
  const timer = setTimeout(callback, delayMs)
  return () => clearTimeout(timer)
}

export interface LiveViewer {
  state(): ViewerState
  subscribe(listener: () => void): () => void
  /** 시청을 시작한다. dispose 뒤에 다시 부르면 처음부터 다시 연결한다. */
  join(): void
  /** playing일 때 영상 요소에 재생을 붙인다. 이미 붙였으면 아무 일도 하지 않는다. */
  attach(video: HTMLVideoElement): void
  /** 화면을 떠난다. 재생과 예약한 확인을 모두 정리한다. */
  dispose(): void
}

export function createLiveViewer(deps: ViewerDeps, broadcastId: number): LiveViewer {
  const playlistUrl = playlistUrlOf(broadcastId)
  const schedule = deps.schedule ?? defaultSchedule
  let current: ViewerState = { phase: 'connecting' }
  const listeners = new Set<() => void>()
  // join과 dispose마다 올린다. 늦게 끝난 확인이 이미 정리된 시청을 건드리지 않게 거른다.
  let generation = 0
  let playback: HlsPlayback | null = null
  let cancelRetry: (() => void) | null = null
  let retries = 0
  let recoveries = 0

  function set(next: ViewerState) {
    current = next
    listeners.forEach((listener) => listener())
  }

  function teardown() {
    cancelRetry?.()
    cancelRetry = null
    playback?.destroy()
    playback = null
  }

  function check(session: number) {
    deps
      .playlistReady(playlistUrl)
      .catch(() => false)
      .then((ready) => {
        if (session !== generation) return
        if (ready) set({ phase: 'playing', playlistUrl })
        else retryLater(session)
      })
  }

  function retryLater(session: number) {
    if (retries >= MAX_RETRIES) {
      void settleByStatus(session, NOT_BROADCASTING_MESSAGE)
      return
    }
    retries += 1
    cancelRetry = schedule(() => {
      cancelRetry = null
      if (session === generation) check(session)
    }, RETRY_INTERVAL_MS)
  }

  /** 방송 중인지 묻는다. 묻지 못하면 실패로 두고, 그 사이 다른 연결이 시작됐으면 null이다. */
  async function checkOnAir(session: number): Promise<boolean | null> {
    let onAir: boolean
    try {
      onAir = await deps.isOnAir(broadcastId)
    } catch {
      if (session === generation) set({ phase: 'failed', message: PLAYBACK_FAILURE_MESSAGE })
      return null
    }
    return session === generation ? onAir : null
  }

  /** 기다리거나 재생하다 막혔다. 방송이 끝났으면 ended, 아직 방송 중이면 message로 실패한다. */
  async function settleByStatus(session: number, message: string) {
    const onAir = await checkOnAir(session)
    if (onAir !== null) set(onAir ? { phase: 'failed', message } : { phase: 'ended' })
  }

  /** 재생이 실패했다. 방송이 끝났으면 ended, 아직 방송 중이면 처음부터 다시 연결한다. */
  async function recover(session: number) {
    teardown()
    const onAir = await checkOnAir(session)
    if (onAir === null) return
    if (!onAir) {
      set({ phase: 'ended' })
      return
    }
    if (recoveries >= RECOVER_LIMIT) {
      set({ phase: 'failed', message: PLAYBACK_FAILURE_MESSAGE })
      return
    }
    recoveries += 1
    retries = 0
    set({ phase: 'connecting' })
    check(session)
  }

  return {
    state: () => current,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    join() {
      generation += 1
      teardown()
      retries = 0
      recoveries = 0
      set({ phase: 'connecting' })
      check(generation)
    },

    attach(video) {
      if (current.phase !== 'playing' || playback) return
      const session = generation
      playback = deps.play(video, current.playlistUrl)
      playback.onFatalError(() => {
        if (session === generation) void recover(session)
      })
    },

    dispose() {
      generation += 1
      teardown()
    },
  }
}
