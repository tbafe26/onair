import { CirclePlay, SquarePlus, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

type SidebarProps = { collapsed: boolean }

const menus: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: '전체 방송', icon: CirclePlay, end: true },
  { to: '/broadcasts/new', label: '방송 등록', icon: SquarePlus },
]

export function Sidebar({ collapsed }: SidebarProps) {
  return (
    <aside
      id="app-sidebar"
      className={cn(
        'sticky top-[var(--header-height)] h-[calc(100vh-var(--header-height))] shrink-0 overflow-y-auto bg-background py-2',
        collapsed
          ? 'w-[var(--sidebar-width-collapsed)] px-[21px]'
          : 'w-[var(--sidebar-width)] px-5',
      )}
    >
      <nav aria-label="주 메뉴" className="flex flex-col gap-1">
        {menus.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            // 접히면 글자가 없으므로 이름은 aria-label로 남긴다.
            aria-label={label}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex h-10 items-center gap-4 rounded-lg text-[15px] font-semibold transition-colors hover:bg-accent',
                collapsed ? 'justify-center' : 'px-2.5',
                isActive ? 'text-brand' : 'text-foreground',
              )
            }
          >
            <Icon className="size-6 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
