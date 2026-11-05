import { useState } from 'react'
import { readStorage, writeStorage } from '@/lib/storage'

const SIDEBAR_KEY = 'sidebar-collapsed'

function isNarrowScreen(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches
  )
}

function readCollapsed(): boolean {
  const stored = readStorage(SIDEBAR_KEY)
  if (stored === 'true') return true
  if (stored === 'false') return false
  // 저장된 선택이 없으면 좁은 화면에서만 접는다.
  return isNarrowScreen()
}

/** 사이드바 접힘 상태. 사용자가 바꾼 값은 브라우저에 기억한다. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)

  const toggleCollapsed = () => {
    const next = !collapsed
    writeStorage(SIDEBAR_KEY, String(next))
    setCollapsed(next)
  }

  return { collapsed, toggleCollapsed }
}
