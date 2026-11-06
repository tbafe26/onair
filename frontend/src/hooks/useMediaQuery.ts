import { useSyncExternalStore } from 'react'

/** CSS 미디어 쿼리가 맞는지 따라간다. matchMedia가 없는 환경에서는 항상 false다. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  )
}

/** Tailwind md(768px) 미만. 휴대폰 폭이다. */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)')
