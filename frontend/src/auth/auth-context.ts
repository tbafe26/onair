import { createContext, useContext } from 'react'
import type { SignupInput, User } from './auth-api'

/** 앱 전체가 보는 로그인 상태. 시작할 때는 서버에 물어보는 중(loading)이다. */
export type AuthState = { status: 'loading' } | { status: 'guest' } | { status: 'user'; user: User }

/** 동작은 실패하면 던진다. 실패 이유를 풀어 보여 주는 일은 호출한 화면이 맡는다. */
export interface Auth {
  state: AuthState
  signup(input: SignupInput): Promise<void>
  login(loginId: string, password: string): Promise<void>
  logout(): Promise<void>
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider 안에서만 쓸 수 있습니다')
  return auth
}
