// 송출 모듈 내부: 송출 중 연결 유지. 서버에 생존 신호를 보내고, 화면 꺼짐 방지(Wake Lock)를 잡는다.

export interface WakeLockHandle {
  release(): Promise<void>
}

export interface KeepAliveDeps {
  sendHeartbeat(): void
  intervalMs: number
  /** 지원하지 않으면 없다. */
  requestWakeLock?: () => Promise<WakeLockHandle>
  /** 화면이 다시 보일 때마다 listener를 부른다. 돌려주는 함수로 구독을 푼다. 지원하지 않으면 없다. */
  watchVisible?: (listener: () => void) => () => void
}

export interface KeepAlive {
  /** 생존 신호를 주기로 보내고 화면 꺼짐 방지를 요청한다. 이미 시작했으면 아무 일도 하지 않는다. */
  start(): void
  /** 신호와 구독을 멈추고 잠금을 푼다. */
  stop(): void
}

export function createKeepAlive(deps: KeepAliveDeps): KeepAlive {
  let active = false
  let timer: ReturnType<typeof setInterval> | null = null
  let unwatchVisible: (() => void) | null = null
  let wakeLock: WakeLockHandle | null = null

  function releaseLock(lock: WakeLockHandle | null) {
    if (lock) void lock.release().catch(() => undefined)
  }

  /** 지원하지 않거나 거절되면 조용히 건너뛴다. */
  function acquireWakeLock() {
    if (!active || !deps.requestWakeLock) return
    void deps.requestWakeLock().then(
      (lock) => {
        if (!active) {
          releaseLock(lock)
          return
        }
        // 이미 잡고 있던 잠금이 있으면 새 잠금으로 바꾼다.
        const previous = wakeLock
        wakeLock = lock
        releaseLock(previous)
      },
      () => undefined,
    )
  }

  return {
    start() {
      if (active) return
      active = true
      timer = setInterval(deps.sendHeartbeat, deps.intervalMs)
      // 브라우저는 화면이 가려지면 잠금을 스스로 풀기 때문에 다시 보일 때 새로 요청한다.
      unwatchVisible = deps.watchVisible?.(acquireWakeLock) ?? null
      acquireWakeLock()
    },

    stop() {
      active = false
      if (timer !== null) clearInterval(timer)
      timer = null
      unwatchVisible?.()
      unwatchVisible = null
      const lock = wakeLock
      wakeLock = null
      releaseLock(lock)
    },
  }
}
