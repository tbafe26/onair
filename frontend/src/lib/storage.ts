// 브라우저 저장소 접근은 막혀 있을 수 있다(사생활 보호 모드 등). 실패하면 조용히 무시한다.

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 저장하지 못해도 이번 방문 동안은 동작한다.
  }
}
