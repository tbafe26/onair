import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { onUnauthorized } from '../api/client'
import { fetchMe, postLogin, postLogout, postSignup } from './auth-api'
import { AuthContext, type Auth, type AuthState } from './auth-context'

/** 앱 최상단에 둔다. 시작할 때 GET /api/auth/me로 로그인 상태를 정하고, 어떤 요청이든 401을 받으면 guest로 바꾼다. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    let current = true
    const release = onUnauthorized(() => setState({ status: 'guest' }))
    fetchMe().then(
      (user) => current && setState({ status: 'user', user }),
      () => current && setState({ status: 'guest' }),
    )
    return () => {
      current = false
      release()
    }
  }, [])

  const auth = useMemo<Auth>(
    () => ({
      state,
      async signup(input) {
        setState({ status: 'user', user: await postSignup(input) })
      },
      async login(loginId, password) {
        setState({ status: 'user', user: await postLogin(loginId, password) })
      },
      async logout() {
        await postLogout()
        setState({ status: 'guest' })
      },
    }),
    [state],
  )

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}
