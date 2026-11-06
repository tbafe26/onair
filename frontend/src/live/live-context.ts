import { createContext, useContext } from 'react'
import type { LiveBroadcaster } from './broadcaster'
import type { LiveViewer } from './viewer'

/** 화면이 송출·시청 모듈을 얻는 이음매. 수명(open/join, dispose)은 훅이 맡으므로 만들기만 한다. */
export interface Live {
  createBroadcaster(): LiveBroadcaster
  createViewer(broadcastId: number): LiveViewer
}

export const LiveContext = createContext<Live | null>(null)

export function useLive(): Live {
  const live = useContext(LiveContext)
  if (!live) throw new Error('LiveProvider 안에서만 쓸 수 있습니다')
  return live
}
