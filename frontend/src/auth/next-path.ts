const FALLBACK = '/'
const AUTH_PAGES = ['/login', '/signup']

/**
 * 로그인·가입 뒤에 돌아갈 주소(?next=)를 걸러 낸다. 같은 사이트 안의 경로만 받고,
 * 외부 주소나 알 수 없는 값은 목록(/)으로 돌린다. 로그인 화면으로 다시 돌아가는 일도 막는다.
 */
export function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return FALLBACK
  // 제어 문자가 섞이면 브라우저가 다르게 해석할 수 있다.
  if ([...raw].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) return FALLBACK
  const base = 'http://same-site.invalid'
  let parsed: URL
  try {
    parsed = new URL(raw, base)
  } catch {
    return FALLBACK
  }
  if (parsed.origin !== base) return FALLBACK
  if (AUTH_PAGES.includes(parsed.pathname)) return FALLBACK
  return raw
}
