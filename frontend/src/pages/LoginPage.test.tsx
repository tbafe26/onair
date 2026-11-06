import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { emptyBroadcastList, signedInAs } from '../test/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

const ME = { id: 1, loginId: 'streamer01', nickname: '방송러' }

function loginAccepts() {
  const bodies: unknown[] = []
  server.use(
    http.post('/api/auth/login', async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(ME)
    }),
  )
  return bodies
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, loginId: string, password: string) {
  await user.type(await screen.findByLabelText('아이디'), loginId)
  await user.type(screen.getByLabelText('비밀번호'), password)
  await user.click(screen.getByRole('button', { name: '로그인' }))
}

it('아이디와 비밀번호로 로그인하면 목록으로 가고 헤더가 닉네임 프로필 메뉴로 바뀐다', async () => {
  emptyBroadcastList()
  const bodies = loginAccepts()
  const user = userEvent.setup()
  const { router } = renderApp('/login')

  await fillAndSubmit(user, 'streamer01', 'password-1234')

  expect(await within(screen.getByRole('banner')).findByRole('button', { name: '방송러' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/')
  expect(bodies).toEqual([{ loginId: 'streamer01', password: 'password-1234' }])
})

it('비밀번호 칸은 입력이 가려진다', async () => {
  renderApp('/login')

  expect(await screen.findByLabelText('비밀번호')).toHaveAttribute('type', 'password')
})

it('?next= 주소가 같은 사이트의 경로면 로그인한 뒤 그곳으로 돌아간다', async () => {
  server.use(http.get('/api/broadcasts/3', () => HttpResponse.json({ status: 404 }, { status: 404 })))
  loginAccepts()
  const user = userEvent.setup()
  const { router } = renderApp('/login?next=%2Fbroadcasts%2F3')

  await fillAndSubmit(user, 'streamer01', 'password-1234')

  await within(screen.getByRole('banner')).findByRole('button', { name: '방송러' })
  expect(router.state.location.pathname).toBe('/broadcasts/3')
})

it('?next= 가 외부 주소면 무시하고 목록으로 간다', async () => {
  emptyBroadcastList()
  loginAccepts()
  const user = userEvent.setup()
  const { router } = renderApp('/login?next=https%3A%2F%2Fevil.example%2F')

  await fillAndSubmit(user, 'streamer01', 'password-1234')

  await within(screen.getByRole('banner')).findByRole('button', { name: '방송러' })
  expect(router.state.location.pathname).toBe('/')
  expect(router.state.location.search).toBe('')
})

it('아이디나 비밀번호가 틀리면 어느 쪽인지 밝히지 않는 안내를 보이고 입력은 그대로 둔다', async () => {
  server.use(
    http.post('/api/auth/login', () =>
      HttpResponse.json(
        { status: 401, detail: '아이디 또는 비밀번호가 올바르지 않습니다' },
        { status: 401 },
      ),
    ),
  )
  const user = userEvent.setup()
  const { router } = renderApp('/login')

  await fillAndSubmit(user, 'streamer01', 'wrong-password')

  expect(await screen.findByRole('alert')).toHaveTextContent('아이디 또는 비밀번호가 올바르지 않습니다')
  expect(screen.getByLabelText('아이디')).toHaveValue('streamer01')
  expect(router.state.location.pathname).toBe('/login')
  expect(within(screen.getByRole('banner')).getByRole('link', { name: '로그인' })).toBeInTheDocument()
})

it('서버 오류는 잠시 후 다시 시도하라고 안내한다', async () => {
  server.use(http.post('/api/auth/login', () => new HttpResponse(null, { status: 500 })))
  const user = userEvent.setup()
  renderApp('/login')

  await fillAndSubmit(user, 'streamer01', 'password-1234')

  expect(await screen.findByRole('alert')).toHaveTextContent('로그인하지 못했습니다')
})

it('가입 화면으로 가는 링크는 next를 이어 준다', async () => {
  renderApp('/login?next=%2Fbroadcasts%2Flive%2Fnew')

  const link = await screen.findByRole('link', { name: '회원가입' })

  expect(link).toHaveAttribute('href', '/signup?next=%2Fbroadcasts%2Flive%2Fnew')
})

it('이미 로그인한 상태로 들어오면 목록으로 보낸다', async () => {
  signedInAs('방송러')
  emptyBroadcastList()
  const { router } = renderApp('/login')

  await within(screen.getByRole('banner')).findByRole('button', { name: '방송러' })

  expect(router.state.location.pathname).toBe('/')
  expect(screen.queryByRole('heading', { name: '로그인' })).not.toBeInTheDocument()
})
