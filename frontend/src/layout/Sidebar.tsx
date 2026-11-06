import { CirclePlay, SquarePlus, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

type SidebarProps = {
  collapsed?: boolean
  /** 휴대폰 폭: 본문 위에 덮어 펼치고, 바깥(어두운 배경)을 누르거나 메뉴를 고르면 onNavigate로 닫는다. */
  overlay?: boolean
  onNavigate?: () => void
}

const menus: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: '전체 방송', icon: CirclePlay, end: true },
  { to: '/broadcasts/new', label: '방송 등록', icon: SquarePlus },
]

export function Sidebar({ collapsed = false, overlay = false, onNavigate }: SidebarProps) {
  const iconOnly = collapsed && !overlay
  const sidebar = (
    <aside
      id="app-sidebar"
      className={cn(
        'top-[var(--header-height)] h-[calc(100vh-var(--header-height))] overflow-y-auto bg-background py-2',
        overlay
          ? 'fixed bottom-0 left-0 z-40 h-auto w-[var(--sidebar-width)] px-5 shadow-lg'
          : 'sticky shrink-0',
        !overlay &&
          (iconOnly ? 'w-[var(--sidebar-width-collapsed)] px-[21px]' : 'w-[var(--sidebar-width)] px-5'),
      )}
    >
      <nav aria-label="주 메뉴" className="flex flex-col gap-1">
        {menus.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            // 접히면 글자가 없으므로 이름은 aria-label로 남긴다.
            aria-label={label}
            title={iconOnly ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex h-10 items-center gap-4 rounded-lg text-[15px] font-semibold transition-colors hover:bg-accent',
                iconOnly ? 'justify-center' : 'px-2.5',
                isActive ? 'text-brand' : 'text-foreground',
              )
            }
          >
            <Icon className="size-6 shrink-0" />
            {!iconOnly && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  )

  if (!overlay) return sidebar
  return (
    <>
      <button
        type="button"
        aria-label="메뉴 닫기"
        tabIndex={-1}
        onClick={onNavigate}
        className="fixed inset-x-0 top-[var(--header-height)] bottom-0 z-30 bg-black/50"
      />
      {sidebar}
    </>
  )
}
