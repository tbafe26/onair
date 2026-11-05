import { act } from '@testing-library/react'

// jsdom에는 IntersectionObserver가 없다. 테스트가 "감시 대상이 화면에 보임"을 직접 일으킬 수 있는 가짜다.
const activeObservers = new Set<FakeIntersectionObserver>()

class FakeIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly scrollMargin = ''
  readonly thresholds: readonly number[] = []
  readonly targets = new Set<Element>()

  constructor(private readonly callback: IntersectionObserverCallback) {
    activeObservers.add(this)
  }

  observe(target: Element) {
    this.targets.add(target)
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
    activeObservers.delete(this)
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  fire() {
    const entries = [...this.targets].map(
      (target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry,
    )
    if (entries.length > 0) this.callback(entries, this)
  }
}

export function installFakeIntersectionObserver() {
  globalThis.IntersectionObserver = FakeIntersectionObserver
}

/** 지금 감시 중인 모든 대상이 화면에 보이게 된 것처럼 콜백을 부른다. */
export function revealObservedElements() {
  act(() => {
    for (const observer of activeObservers) observer.fire()
  })
}

/** 지금 감시 중인 대상의 수. 감시를 멈췄는지 확인할 때 쓴다. */
export function observedElementCount() {
  let count = 0
  for (const observer of activeObservers) count += observer.targets.size
  return count
}
