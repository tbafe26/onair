import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLive } from './live-context'

/** 송출 모듈을 화면에 잇는 얇은 훅. 화면에 들어오면 카메라를 열고, 떠나면 정리한다. */
export function useLiveBroadcaster() {
  const live = useLive()
  const [broadcaster] = useState(() => live.createBroadcaster())

  useEffect(() => {
    broadcaster.open()
    return () => broadcaster.dispose()
  }, [broadcaster])

  const state = useSyncExternalStore(broadcaster.subscribe, broadcaster.state)
  const camera = useSyncExternalStore(broadcaster.subscribe, broadcaster.cameraInfo)
  return { state, camera, start: broadcaster.start, end: broadcaster.end, switchCamera: broadcaster.switchCamera }
}
