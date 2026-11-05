import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { useSidebarCollapsed } from './sidebar-state'

/** 모든 화면을 감싸는 틀: 위에 헤더, 왼쪽에 접히는 사이드바, 나머지가 본문. */
export function AppShell() {
  const { collapsed, toggleCollapsed } = useSidebarCollapsed()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header onToggleSidebar={toggleCollapsed} sidebarExpanded={!collapsed} />
      <div className="flex flex-1">
        <Sidebar collapsed={collapsed} />
        <main className="min-w-0 flex-1 px-5 pt-8 pb-16">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
