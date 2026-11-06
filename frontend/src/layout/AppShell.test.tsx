import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

beforeEach(() => {
  server.use(
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

/** 화면 폭을 흉내 낸다. max-width 쿼리는 그 폭 이하일 때 맞는다. */
function stubScreen(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query)
    return {
      matches: max !== null && width <= Number(max[1]),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }
  })
}

const sidebar = () => screen.getByRole('navigation', { name: '주 메뉴' })
const hamburger = () => screen.getByRole('button', { name: '사이드바 접기/펼치기' })
const themeButton = () => screen.getByRole('button', { name: '테마 전환' })

it('헤더에 로고 링크와 녹화방송 등록·라이브 송출 버튼이, 본문에 전체 방송 제목이 보인다', async () => {
  renderApp('/')

  const header = screen.getByRole('banner')
  expect(within(header).getByRole('link', { name: '온에어' })).toHaveAttribute('href', '/')
  expect(within(header).getByRole('link', { name: '녹화방송 등록' })).toHaveAttribute(
    'href',
    '/broadcasts/new',
  )
  expect(within(header).getByRole('link', { name: '라이브 송출' })).toHaveAttribute(
    'href',
    '/broadcasts/live/new',
  )
  expect(within(header).queryByRole('link', { name: '방송 등록' })).not.toBeInTheDocument()
  expect(
    within(screen.getByRole('main')).getByRole('heading', { name: '전체 방송' }),
  ).toBeInTheDocument()
  expect(await screen.findByText('라이브 방송이 없습니다')).toBeInTheDocument()
})

it('사이드바에 전체 방송과 방송 등록 메뉴가 있고 현재 주소의 메뉴만 강조된다', async () => {
  renderApp('/')

  expect(within(sidebar()).getByRole('link', { name: '전체 방송' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(within(sidebar()).getByRole('link', { name: '방송 등록' })).not.toHaveAttribute(
    'aria-current',
  )

  await userEvent.click(within(sidebar()).getByRole('link', { name: '방송 등록' }))

  expect(within(sidebar()).getByRole('link', { name: '방송 등록' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(within(sidebar()).getByRole('link', { name: '전체 방송' })).not.toHaveAttribute(
    'aria-current',
  )
})

it('햄버거로 사이드바를 아이콘만 보이게 접고 다시 펼친다', async () => {
  renderApp('/')

  expect(hamburger()).toHaveAttribute('aria-expanded', 'true')
  expect(within(sidebar()).getByText('전체 방송')).toBeInTheDocument()

  await userEvent.click(hamburger())

  expect(hamburger()).toHaveAttribute('aria-expanded', 'false')
  expect(within(sidebar()).queryByText('전체 방송')).not.toBeInTheDocument()
  // 글자가 없어도 링크는 이름으로 찾을 수 있다.
  expect(within(sidebar()).getByRole('link', { name: '전체 방송' })).toBeInTheDocument()

  await userEvent.click(hamburger())

  expect(hamburger()).toHaveAttribute('aria-expanded', 'true')
  expect(within(sidebar()).getByText('전체 방송')).toBeInTheDocument()
})

it('접어 둔 사이드바는 다시 그려도 접힌 채 유지된다', async () => {
  const first = renderApp('/')
  await userEvent.click(hamburger())
  first.unmount()

  renderApp('/')

  expect(hamburger()).toHaveAttribute('aria-expanded', 'false')
})

it('좁은 화면에서는 사이드바가 기본으로 접혀 있고, 저장된 선택이 있으면 그것을 따른다', async () => {
  stubScreen(1000)

  const first = renderApp('/')
  expect(hamburger()).toHaveAttribute('aria-expanded', 'false')

  await userEvent.click(hamburger())
  first.unmount()

  renderApp('/')
  expect(hamburger()).toHaveAttribute('aria-expanded', 'true')
})

it('처음 방문하면 다크 테마이고, 테마 버튼으로 라이트와 다크를 오간다', async () => {
  renderApp('/')

  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

  await userEvent.click(themeButton())
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')

  await userEvent.click(themeButton())
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
})

it('고른 테마는 다시 그린 뒤에도 유지된다', async () => {
  const first = renderApp('/')
  await userEvent.click(themeButton())
  first.unmount()
  document.documentElement.removeAttribute('data-theme')

  renderApp('/')

  expect(document.documentElement).toHaveAttribute('data-theme', 'light')
})

it('브라우저 저장소를 쓸 수 없어도 다크로 동작하고 전환도 된다', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('저장소 사용 불가')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('저장소 사용 불가')
  })

  renderApp('/')
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

  await userEvent.click(themeButton())
  expect(document.documentElement).toHaveAttribute('data-theme', 'light')

  await userEvent.click(hamburger())
  expect(hamburger()).toHaveAttribute('aria-expanded', 'false')

  vi.restoreAllMocks()
})

describe('휴대폰 폭(768px 미만)', () => {
  beforeEach(() => stubScreen(375))

  it('헤더의 녹화방송 등록과 라이브 송출은 글자 없는 아이콘 버튼이고 이름은 유지된다', () => {
    renderApp('/')

    const header = screen.getByRole('banner')
    const register = within(header).getByRole('link', { name: '녹화방송 등록' })
    const live = within(header).getByRole('link', { name: '라이브 송출' })
    expect(register).toHaveAttribute('href', '/broadcasts/new')
    expect(live).toHaveAttribute('href', '/broadcasts/live/new')

    expect(register.querySelector('svg')).not.toBeNull()
    expect(register).not.toHaveTextContent(/\S/)
    expect(live).not.toHaveTextContent(/\S/)
  })

  it('사이드바는 기본으로 숨어 있고 햄버거로 덮어 펼친 뒤 다시 누르면 닫힌다', async () => {
    renderApp('/')

    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument()
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(hamburger())

    expect(hamburger()).toHaveAttribute('aria-expanded', 'true')
    // 접힌 아이콘 모양이 아니라 글자가 있는 전체 메뉴다.
    expect(within(sidebar()).getByText('전체 방송')).toBeInTheDocument()

    await userEvent.click(hamburger())

    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument()
  })

  it('바깥을 누르거나 Escape를 누르면 닫힌다', async () => {
    renderApp('/')

    await userEvent.click(hamburger())
    await userEvent.click(screen.getByRole('button', { name: '메뉴 닫기' }))
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument()

    await userEvent.click(hamburger())
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument()
  })

  it('메뉴를 고르면 그 화면으로 가고 사이드바가 닫힌다', async () => {
    const { router } = renderApp('/')

    await userEvent.click(hamburger())
    await userEvent.click(within(sidebar()).getByRole('link', { name: '방송 등록' }))

    expect(router.state.location.pathname).toBe('/broadcasts/new')
    expect(screen.queryByRole('navigation', { name: '주 메뉴' })).not.toBeInTheDocument()
  })

  it('넓은 화면의 접기 선택은 건드리지 않는다', async () => {
    renderApp('/')

    await userEvent.click(hamburger())

    expect(localStorage.getItem('sidebar-collapsed')).toBeNull()
  })
})
