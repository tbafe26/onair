import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openJsonSocket } from './json-socket'

type Listener = (event: unknown) => void

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readonly listeners = new Map<string, Listener[]>()
  readonly sent: string[] = []
  closeCalls = 0

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closeCalls += 1
  }

  emit(type: string, event: unknown = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(event))
  }
}

const parseNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null)

function connect() {
  const onMessage = vi.fn()
  const onClose = vi.fn()
  const opening = openJsonSocket<number, { a: number }>('/api/test', parseNumber, { onMessage, onClose }, '연결 실패')
  return { opening, socket: FakeWebSocket.instances[0], onMessage, onClose }
}

describe('openJsonSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('window', { location: { protocol: 'https:', host: 'example.test' } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('현재 출처의 경로로 연결하고, https면 wss를 쓴다', () => {
    connect()
    expect(FakeWebSocket.instances[0].url).toBe('wss://example.test/api/test')
  })

  it('http 출처에서는 ws를 쓴다', () => {
    vi.stubGlobal('window', { location: { protocol: 'http:', host: 'example.test' } })
    connect()
    expect(FakeWebSocket.instances[0].url).toBe('ws://example.test/api/test')
  })

  it('열리면 채널을 돌려주고 send는 JSON으로 보낸다', async () => {
    const { opening, socket } = connect()
    socket.emit('open')
    const channel = await opening
    channel.send({ a: 1 })
    expect(socket.sent).toEqual(['{"a":1}'])
  })

  it('파서를 통과한 메시지만 전달한다', async () => {
    const { opening, socket, onMessage } = connect()
    socket.emit('open')
    await opening
    socket.emit('message', { data: '7' })
    socket.emit('message', { data: '"text"' })
    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith(7)
  })

  it('잘못된 JSON과 문자열이 아닌 데이터는 무시한다', async () => {
    const { opening, socket, onMessage } = connect()
    socket.emit('open')
    await opening
    socket.emit('message', { data: '{깨진' })
    socket.emit('message', { data: new ArrayBuffer(2) })
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('연결 중에 실패하면 오류로 거절한다', async () => {
    const { opening, socket } = connect()
    socket.emit('error')
    await expect(opening).rejects.toThrow('연결 실패')
  })

  it('직접 닫으면 소켓을 닫고 닫힘을 알리지 않는다', async () => {
    const { opening, socket, onClose } = connect()
    socket.emit('open')
    const channel = await opening
    channel.close()
    socket.emit('close')
    expect(socket.closeCalls).toBe(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('서버가 끊으면 닫힘을 알린다', async () => {
    const { opening, socket, onClose } = connect()
    socket.emit('open')
    await opening
    socket.emit('close')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
