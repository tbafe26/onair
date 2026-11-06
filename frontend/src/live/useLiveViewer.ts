import { useEffect, useState, useSyncExternalStore } from 'react'
import { createLiveViewer, type ViewerDeps } from './viewer'

/** 시청 모듈을 화면에 잇는 얇은 훅. 화면에 들어오면 연결하고, 떠나면 정리한다. */
export function useLiveViewer(deps: ViewerDeps, broadcastId: number) {
  const [viewer] = useState(() => createLiveViewer(deps, broadcastId))

  useEffect(() => {
    viewer.join()
    return () => viewer.dispose()
  }, [viewer])

  return useSyncExternalStore(viewer.subscribe, viewer.state)
}
