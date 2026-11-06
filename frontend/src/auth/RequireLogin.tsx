import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './auth-context'

/**
 * 로그인해야 쓸 수 있는 화면을 감싼다. 비로그인이면 로그인 화면으로 보내고, 로그인하면 이 화면으로 돌아온다.
 * 화면 이동은 보조 수단이며, 권한 검사는 서버가 한다.
 */
export function RequireLogin({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return null
  if (state.status === 'guest') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return children
}
