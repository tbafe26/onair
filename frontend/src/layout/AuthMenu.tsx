import { LogIn, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/hooks/useMediaQuery'

/** 헤더 오른쪽 끝. 비로그인이면 로그인 버튼, 로그인하면 닉네임 프로필 메뉴다. 휴대폰 폭에서는 아이콘 버튼이다. */
export function AuthMenu() {
  const { state } = useAuth()
  const isMobile = useIsMobile()
  const location = useLocation()

  if (state.status === 'loading') return null

  if (state.status === 'guest') {
    // 로그인 화면 안에서는 돌아갈 곳이 로그인 화면이 아니도록 next를 붙이지 않는다.
    const onAuthPage = location.pathname === '/login' || location.pathname === '/signup'
    const target = onAuthPage
      ? '/login'
      : `/login?next=${encodeURIComponent(location.pathname + location.search)}`
    return isMobile ? (
      <Button asChild variant="outline" size="icon">
        <Link to={target} aria-label="로그인">
          <LogIn className="size-5" />
        </Link>
      </Button>
    ) : (
      <Button asChild variant="outline" className="h-9 px-5">
        <Link to={target}>로그인</Link>
      </Button>
    )
  }

  return <ProfileMenu nickname={state.user.nickname} compact={isMobile} />
}

function ProfileMenu({ nickname, compact }: { nickname: string; compact: boolean }) {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  async function handleLogout() {
    setOpen(false)
    try {
      await logout()
    } catch {
      // 로그아웃 요청이 실패하면 서버 세션이 남아 있으므로 로그인 상태를 그대로 둔다.
    }
  }

  return (
    <div ref={root} className="relative">
      <Button
        variant="outline"
        size={compact ? 'icon' : 'default'}
        className={compact ? undefined : 'h-9 max-w-48 px-4'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? nickname : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {compact ? (
          <User className="size-5" />
        ) : (
          <span className="truncate">{nickname}</span>
        )}
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-30 mt-2 min-w-44 rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          <p className="truncate px-3 py-2 text-sm text-sub">{nickname}</p>
          <Link
            to="/me/broadcasts"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block w-full rounded-lg px-3 py-2 text-left font-semibold text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            내 방송
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            className="w-full rounded-lg px-3 py-2 text-left font-semibold text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
