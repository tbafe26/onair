import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it, vi } from 'vitest'
import { renderApp } from '../test/renderApp'
import { emptyBroadcastList, signedInAs } from '../test/auth'
import { server } from '../test/server'

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

const header = () => screen.getByRole('banner')

/** 휴대폰 폭을 흉내 낸다. max-width 쿼리는 그 폭 이하일 때 맞는다. */
function stubMobile() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /max-width:\s*767px/.test(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

it('비로그인이면 헤더 오른쪽에 로그인 버튼이 있고, 지금 보던 화면으로 돌아오도록 next를 싣는다', async () => {
  emptyBroadcastList()
  renderApp('/')

  const login = await within(header()).findByRole('link', { name: '로그인' })

  expect(login).toHaveAttribute('href', '/login?next=%2F')
  expect(within(header()).queryByRole('button', { name: '방송러' })).not.toBeInTheDocument()
})

it('로그인 화면 안의 로그인 버튼은 next를 싣지 않는다', async () => {
  renderApp('/login?next=%2Fbroadcasts%2F3')

  const login = await within(header()).findByRole('link', { name: '로그인' })

  expect(login).toHaveAttribute('href', '/login')
})

it('로그인한 상태로 시작하면 로그인 버튼 대신 닉네임 프로필 메뉴가 보인다', async () => {
  signedInAs('방송러')
  emptyBroadcastList()
  renderApp('/')

  expect(await within(header()).findByRole('button', { name: '방송러' })).toBeInTheDocument()
  expect(within(header()).queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
})

it('로그인 상태를 알아내는 동안에는 로그인 버튼도 프로필 메뉴도 보이지 않는다', () => {
  signedInAs('방송러')
  emptyBroadcastList()
  renderApp('/')

  expect(within(header()).queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
  expect(within(header()).queryByRole('button', { name: '방송러' })).not.toBeInTheDocument()
})

it('프로필 메뉴에서 로그아웃하면 CSRF 토큰과 함께 요청하고 헤더가 로그인 버튼으로 바뀐다', async () => {
  signedInAs('방송러')
  emptyBroadcastList()
  document.cookie = 'XSRF-TOKEN=token-1; path=/'
  let csrf: string | null = null
  server.use(
    http.post('/api/auth/logout', ({ request }) => {
      csrf = request.headers.get('X-XSRF-TOKEN')
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const user = userEvent.setup()
  renderApp('/')

  await user.click(await within(header()).findByRole('button', { name: '방송러' }))
  await user.click(screen.getByRole('menuitem', { name: '로그아웃' }))

  expect(await within(header()).findByRole('link', { name: '로그인' })).toBeInTheDocument()
  expect(within(header()).queryByRole('button', { name: '방송러' })).not.toBeInTheDocument()
  expect(csrf).toBe('token-1')
})

it('메뉴는 Escape로 닫힌다', async () => {
  signedInAs('방송러')
  emptyBroadcastList()
  const user = userEvent.setup()
  renderApp('/')

  await user.click(await within(header()).findByRole('button', { name: '방송러' }))
  expect(screen.getByRole('menu')).toBeInTheDocument()
  await user.keyboard('{Escape}')

  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('로그아웃 요청이 실패하면 로그인 상태를 그대로 둔다', async () => {
  signedInAs('방송러')
  emptyBroadcastList()
  server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 500 })))
  const user = userEvent.setup()
  renderApp('/')

  await user.click(await within(header()).findByRole('button', { name: '방송러' }))
  await user.click(screen.getByRole('menuitem', { name: '로그아웃' }))

  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(within(header()).getByRole('button', { name: '방송러' })).toBeInTheDocument()
})

it('휴대폰 폭에서는 로그인 버튼이 아이콘 버튼으로 줄어든다', async () => {
  stubMobile()
  emptyBroadcastList()
  renderApp('/')

  const login = await within(header()).findByRole('link', { name: '로그인' })

  expect(login).toHaveTextContent('')
})

it('휴대폰 폭에서도 프로필 메뉴는 닉네임을 이름으로 가진 아이콘 버튼이고 메뉴에 닉네임이 보인다', async () => {
  stubMobile()
  signedInAs('방송러')
  emptyBroadcastList()
  const user = userEvent.setup()
  renderApp('/')

  const profile = await within(header()).findByRole('button', { name: '방송러' })
  expect(profile).toHaveTextContent('')
  await user.click(profile)

  expect(within(screen.getByRole('menu')).getByText('방송러')).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: '로그아웃' })).toBeInTheDocument()
})
