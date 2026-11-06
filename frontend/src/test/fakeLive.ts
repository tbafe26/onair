import { vi } from 'vitest'
import type { BroadcasterState, CameraInfo, LiveBroadcaster } from '../live/broadcaster'
import type { ChatState, LiveChat } from '../live/chat'
import type { Live } from '../live/live-context'
import type { LiveViewer, ViewerState } from '../live/viewer'

/** 화면 테스트용 송출 모듈. 상태는 테스트가 setState로 직접 바꾸고, 화면이 부른 동작은 vi.fn으로 확인한다. */
export interface FakeBroadcaster extends LiveBroadcaster {
  setState(state: BroadcasterState): void
  setCamera(patch: Partial<CameraInfo>): void
  open: ReturnType<typeof vi.fn<LiveBroadcaster['open']>>
  start: ReturnType<typeof vi.fn<LiveBroadcaster['start']>>
  end: ReturnType<typeof vi.fn<LiveBroadcaster['end']>>
  switchCamera: ReturnType<typeof vi.fn<LiveBroadcaster['switchCamera']>>
  dispose: ReturnType<typeof vi.fn<LiveBroadcaster['dispose']>>
}

export interface FakeViewer extends LiveViewer {
  setState(state: ViewerState): void
  join: ReturnType<typeof vi.fn<LiveViewer['join']>>
  dispose: ReturnType<typeof vi.fn<LiveViewer['dispose']>>
}

export interface FakeChat extends LiveChat {
  setState(state: ChatState): void
  join: ReturnType<typeof vi.fn<LiveChat['join']>>
  send: ReturnType<typeof vi.fn<LiveChat['send']>>
  dispose: ReturnType<typeof vi.fn<LiveChat['dispose']>>
}

export const fakeStream = () => ({ getTracks: () => [] }) as unknown as MediaStream

function createStore<T>(initial: T) {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set(next: T) {
      current = next
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

export function createFakeBroadcaster(): FakeBroadcaster {
  const state = createStore<BroadcasterState>({ phase: 'requestingCamera' })
  const camera = createStore<CameraInfo>({ facing: 'user', canSwitch: false, switching: false, switchFailure: null })
  const subscribe = (listener: () => void) => {
    const stopState = state.subscribe(listener)
    const stopCamera = camera.subscribe(listener)
    return () => {
      stopState()
      stopCamera()
    }
  }
  return {
    state: state.get,
    cameraInfo: camera.get,
    subscribe,
    setState: state.set,
    setCamera: (patch) => camera.set({ ...camera.get(), ...patch }),
    open: vi.fn(),
    start: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    switchCamera: vi.fn(async () => {}),
    dispose: vi.fn(),
  }
}

export function createFakeViewer(): FakeViewer {
  const state = createStore<ViewerState>({ phase: 'connecting' })
  return {
    state: state.get,
    subscribe: state.subscribe,
    setState: state.set,
    join: vi.fn(),
    dispose: vi.fn(),
  }
}

export function createFakeChat(): FakeChat {
  const state = createStore<ChatState>({ phase: 'connecting' })
  return {
    state: state.get,
    subscribe: state.subscribe,
    setState: state.set,
    join: vi.fn(),
    send: vi.fn(async () => {}),
    dispose: vi.fn(),
  }
}

/**
 * 화면 테스트용 Live. 화면 하나가 모듈 하나를 만든다고 보고 같은 가짜를 돌려준다(채팅도 같다).
 * createViewer는 부른 방송 번호와 횟수를 기록하므로 시청 연결을 만들지 않았는지도 확인할 수 있다.
 */
export function createFakeLive() {
  const broadcaster = createFakeBroadcaster()
  const viewer = createFakeViewer()
  const chat = createFakeChat()
  const createViewer = vi.fn<Live['createViewer']>(() => viewer)
  const createChat = vi.fn<Live['createChat']>(() => chat)
  const live: Live = { createBroadcaster: () => broadcaster, createViewer, createChat }
  return { live, broadcaster, viewer, createViewer, chat, createChat }
}
