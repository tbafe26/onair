import axios from 'axios'

const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'X-XSRF-TOKEN'
const SAFE_METHODS = new Set(['get', 'head', 'options'])

function readCookie(name: string): string | null {
  for (const part of document.cookie.split('; ')) {
    const separator = part.indexOf('=')
    if (part.slice(0, separator) === name) return decodeURIComponent(part.slice(separator + 1))
  }
  return null
}

let unauthorizedHandler: (() => void) | null = null

/** 응답이 401(로그인하지 않았거나 세션이 끝남)일 때 불릴 함수를 정한다. 돌려주는 함수로 해제한다. */
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

/**
 * 모든 API 호출이 거치는 클라이언트. 화면은 상대 경로로 호출하고, 개발 중에는 Vite 프록시가 백엔드로 넘긴다.
 * 상태를 바꾸는 요청에는 서버가 쿠키로 준 CSRF 토큰을 헤더로 싣고, 401 응답은 인증 상태에 알린다.
 */
export const apiClient = axios.create({ withXSRFToken: false })

apiClient.interceptors.request.use((config) => {
  if (!SAFE_METHODS.has((config.method ?? 'get').toLowerCase())) {
    const token = readCookie(CSRF_COOKIE)
    if (token) config.headers.set(CSRF_HEADER, token)
  }
  return config
})

apiClient.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401) unauthorizedHandler?.()
  return Promise.reject(error)
})
