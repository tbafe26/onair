import type { ReactNode } from 'react'
import { browserLive } from './browser-live'
import { LiveContext, type Live } from './live-context'

/** 앱 최상단에 둔다. 값을 주지 않으면 실제 브라우저 모듈을 쓰고, 테스트는 가짜를 넣는다. */
export function LiveProvider({ live = browserLive, children }: { live?: Live; children: ReactNode }) {
  return <LiveContext.Provider value={live}>{children}</LiveContext.Provider>
}
