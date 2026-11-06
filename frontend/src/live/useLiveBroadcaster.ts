import { useEffect, useState, useSyncExternalStore } from 'react'
import { createLiveBroadcaster, type BroadcasterDeps } from './broadcaster'

/** 송출 모듈을 화면에 잇는 얇은 훅. 화면에 들어오면 카메라를 열고, 떠나면 정리한다. */
export function useLiveBroadcaster(deps: BroadcasterDeps) {
  const [broadcaster] = useState(() => createLiveBroadcaster(deps))

  useEffect(() => {
    broadcaster.open()
    return () => broadcaster.dispose()
  }, [broadcaster])

  const state = useSyncExternalStore(broadcaster.subscribe, broadcaster.state)
  return { state, start: broadcaster.start, end: broadcaster.end }
}
