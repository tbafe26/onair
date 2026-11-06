import { apiClient } from '../api/client'

/** 로그인한 사용자(서버의 내 정보). */
export interface User {
  id: number
  loginId: string
  nickname: string
}

export interface SignupInput {
  loginId: string
  password: string
  nickname: string
}

export async function fetchMe(): Promise<User> {
  const response = await apiClient.get<User>('/api/auth/me')
  return response.data
}

export async function postSignup(input: SignupInput): Promise<User> {
  const response = await apiClient.post<User>('/api/auth/signup', input)
  return response.data
}

export async function postLogin(loginId: string, password: string): Promise<User> {
  const response = await apiClient.post<User>('/api/auth/login', { loginId, password })
  return response.data
}

export async function postLogout(): Promise<void> {
  await apiClient.post('/api/auth/logout')
}
