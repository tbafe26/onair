import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { useSidebarCollapsed } from './sidebar-state'

/** 모든 화면을 감싸는 틀: 위에 헤더, 왼쪽에 접히는 사이드바, 나머지가 본문. 휴대폰 폭에서는 사이드바가 화면 위에 덮어 펼쳐진다. */
export function AppShell() {
  const { collapsed, toggleCollapsed } = useSidebarCollapsed()
  const isMobile = useIsMobile()
  const [overlayOpen, setOverlayOpen] = useState(false)
  const showOverlay = isMobile && overlayOpen

  useEffect(() => {
    if (!showOverlay) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverlayOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [showOverlay])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header
        onToggleSidebar={isMobile ? () => setOverlayOpen((open) => !open) : toggleCollapsed}
        sidebarExpanded={isMobile ? showOverlay : !collapsed}
      />
      <div className="flex flex-1">
        {isMobile ? (
          showOverlay && <Sidebar overlay onNavigate={() => setOverlayOpen(false)} />
        ) : (
          <Sidebar collapsed={collapsed} />
        )}
        <main className="min-w-0 flex-1 px-5 pt-8 pb-16">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
