import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLive } from './live-context'

/** 채팅 모듈을 화면에 잇는 얇은 훅. 화면에 들어오면 연결하고, 떠나면 정리한다. */
export function useLiveChat(broadcastId: number) {
  const live = useLive()
  const [chat] = useState(() => live.createChat(broadcastId))

  useEffect(() => {
    chat.join()
    return () => chat.dispose()
  }, [chat])

  const state = useSyncExternalStore(chat.subscribe, chat.state)
  return { state, send: chat.send, retry: chat.join }
}
