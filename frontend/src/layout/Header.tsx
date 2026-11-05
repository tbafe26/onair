import { Menu, Moon, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { APP_NAME } from '@/app-name'
import { Button } from '@/components/ui/button'
import { useTheme } from './theme'

type HeaderProps = {
  onToggleSidebar: () => void
  sidebarExpanded: boolean
}

export function Header({ onToggleSidebar, sidebarExpanded }: HeaderProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="sticky top-0 z-20 flex h-[var(--header-height)] shrink-0 items-center justify-between bg-background px-5">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="사이드바 접기/펼치기"
          aria-expanded={sidebarExpanded}
          aria-controls="app-sidebar"
          onClick={onToggleSidebar}
        >
          <Menu className="size-6" />
        </Button>
        <Link to="/" className="text-[22px] font-extrabold tracking-tight text-foreground">
          {APP_NAME}
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" aria-label="테마 전환" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun className="size-6" /> : <Moon className="size-6" />}
        </Button>
        <Button asChild className="h-9 px-5">
          <Link to="/broadcasts/new">방송 등록</Link>
        </Button>
      </div>
    </header>
  )
}
