import { useLayoutEffect, useState } from 'react'
import { readStorage, writeStorage } from '@/lib/storage'
import { THEME_KEY } from './theme-key'

export type Theme = 'dark' | 'light'

// index.html의 인라인 스크립트도 같은 THEME_KEY를 읽는다(vite.config.ts가 주입).
function readTheme(): Theme {
  return readStorage(THEME_KEY) === 'light' ? 'light' : 'dark'
}

/** 현재 테마와 전환 함수. 루트의 data-theme에 반영하고 선택을 저장한다. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    writeStorage(THEME_KEY, next)
    setTheme(next)
  }

  return { theme, toggleTheme }
}
