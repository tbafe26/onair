export interface JsonSocketHandlers<In> {
  onMessage(message: In): void
  /** 서버가 닫았거나 연결이 끊겼다. close()를 직접 부른 경우에는 호출하지 않는다. */
  onClose(): void
}

export interface JsonSocketChannel<Out> {
  send(message: Out): void
  close(): void
}

function socketUrl(path: string): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${window.location.host}${path}`
}

/**
 * 현재 출처의 path로 JSON WebSocket을 연다. 열리면 채널을 돌려준다.
 * 수신 메시지는 parse를 통과(null이 아님)한 것만 전달하고, JSON이 아니거나 문자열이 아닌 데이터는 무시한다.
 */
export function openJsonSocket<In, Out = never>(
  path: string,
  parse: (value: unknown) => In | null,
  handlers: JsonSocketHandlers<In>,
  failureMessage: string,
): Promise<JsonSocketChannel<Out>> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl(path))
    let manuallyClosed = false
    socket.addEventListener('open', () =>
      resolve({
        send: (message) => socket.send(JSON.stringify(message)),
        close: () => {
          manuallyClosed = true
          socket.close()
        },
      }),
    )
    socket.addEventListener('error', () => reject(new Error(failureMessage)))
    socket.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data !== 'string') return
      try {
        const message = parse(JSON.parse(event.data))
        if (message) handlers.onMessage(message)
      } catch {
        // 알아볼 수 없는 메시지는 무시한다.
      }
    })
    socket.addEventListener('close', () => {
      if (!manuallyClosed) handlers.onClose()
    })
  })
}
