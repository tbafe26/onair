import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { emptyBroadcastList, signedInAs } from '../test/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

type User = ReturnType<typeof userEvent.setup>

async function fill(
  user: User,
  values: { loginId?: string; password?: string; confirm?: string; nickname?: string },
) {
  if (values.loginId) await user.type(await screen.findByLabelText('아이디'), values.loginId)
  if (values.password) await user.type(screen.getByLabelText('비밀번호'), values.password)
  if (values.confirm) await user.type(screen.getByLabelText('비밀번호 확인'), values.confirm)
  if (values.nickname) await user.type(screen.getByLabelText('닉네임'), values.nickname)
}

const submit = (user: User) => user.click(screen.getByRole('button', { name: '가입하기' }))

const VALID = {
  loginId: 'streamer01',
  password: 'password-1234',
  confirm: 'password-1234',
  nickname: '방송러',
}

it('입력칸 근처에 아이디·비밀번호·닉네임 규칙이 보이고 비밀번호 칸은 가려진다', async () => {
  renderApp('/signup')

  expect(await screen.findByLabelText('아이디')).toHaveAccessibleDescription('영문 소문자와 숫자 4~20자')
  expect(screen.getByLabelText('비밀번호')).toHaveAccessibleDescription('8~64자')
  expect(screen.getByLabelText('닉네임')).toHaveAccessibleDescription('1~20자')
  expect(screen.getByLabelText('비밀번호')).toHaveAttribute('type', 'password')
  expect(screen.getByLabelText('비밀번호 확인')).toHaveAttribute('type', 'password')
})

it('가입하면 바로 로그인되어 목록으로 가고 헤더에 닉네임이 보인다', async () => {
  emptyBroadcastList()
  const bodies: unknown[] = []
  server.use(
    http.post('/api/auth/signup', async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ id: 1, loginId: 'streamer01', nickname: '방송러' }, { status: 201 })
    }),
  )
  const user = userEvent.setup()
  const { router } = renderApp('/signup')

  await fill(user, VALID)
  await submit(user)

  expect(await within(screen.getByRole('banner')).findByRole('button', { name: '방송러' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/')
  expect(bodies).toEqual([{ loginId: 'streamer01', password: 'password-1234', nickname: '방송러' }])
})

it('비밀번호 확인이 다르면 요청을 보내지 않고 그 칸에 알려 준다', async () => {
  let requested = false
  server.use(
    http.post('/api/auth/signup', () => {
      requested = true
      return HttpResponse.json({}, { status: 201 })
    }),
  )
  const user = userEvent.setup()
  renderApp('/signup')

  await fill(user, { ...VALID, confirm: 'password-9999' })
  await submit(user)

  expect(await screen.findByText('비밀번호가 일치하지 않습니다')).toBeInTheDocument()
  expect(screen.getByLabelText('비밀번호 확인')).toHaveAccessibleDescription('비밀번호가 일치하지 않습니다')
  expect(requested).toBe(false)
})

it('규칙에 맞지 않는 값은 서버가 알려 준 칸마다 이유를 보여 주고 입력은 그대로 둔다', async () => {
  server.use(
    http.post('/api/auth/signup', () =>
      HttpResponse.json(
        {
          status: 400,
          errors: [
            { field: 'loginId', reason: '아이디는 영문 소문자와 숫자 4~20자로 입력하세요' },
            { field: 'nickname', reason: '닉네임은 1~20자로 입력하세요' },
          ],
        },
        { status: 400 },
      ),
    ),
  )
  const user = userEvent.setup()
  renderApp('/signup')

  await fill(user, { loginId: 'AB', password: 'password-1234', confirm: 'password-1234', nickname: 'x' })
  await submit(user)

  expect(await screen.findByLabelText('아이디')).toHaveAccessibleDescription(
    /아이디는 영문 소문자와 숫자 4~20자로 입력하세요/,
  )
  expect(screen.getByLabelText('닉네임')).toHaveAccessibleDescription(/닉네임은 1~20자로 입력하세요/)
  expect(screen.getByLabelText('비밀번호')).toHaveAccessibleDescription('8~64자')
  expect(screen.getByLabelText('아이디')).toHaveValue('AB')
})

it('이미 쓰는 아이디면 아이디 칸에 알려 준다', async () => {
  server.use(
    http.post('/api/auth/signup', () =>
      HttpResponse.json({ status: 409, detail: '이미 사용 중인 아이디입니다' }, { status: 409 }),
    ),
  )
  const user = userEvent.setup()
  const { router } = renderApp('/signup')

  await fill(user, VALID)
  await submit(user)

  expect(await screen.findByText('이미 사용 중인 아이디입니다')).toBeInTheDocument()
  expect(screen.getByLabelText('아이디')).toHaveAccessibleDescription(/이미 사용 중인 아이디입니다/)
  expect(router.state.location.pathname).toBe('/signup')
})

it('서버 오류는 잠시 후 다시 시도하라고 안내한다', async () => {
  server.use(http.post('/api/auth/signup', () => new HttpResponse(null, { status: 500 })))
  const user = userEvent.setup()
  renderApp('/signup')

  await fill(user, VALID)
  await submit(user)

  expect(await screen.findByRole('alert')).toHaveTextContent('가입하지 못했습니다')
})

it('?next= 주소가 같은 사이트의 경로면 가입한 뒤 그곳으로 가고, 로그인 링크도 next를 이어 준다', async () => {
  server.use(
    http.get('/api/broadcasts/3', () => HttpResponse.json({ status: 404 }, { status: 404 })),
    http.post('/api/auth/signup', () =>
      HttpResponse.json({ id: 1, loginId: 'streamer01', nickname: '방송러' }, { status: 201 }),
    ),
  )
  const user = userEvent.setup()
  const { router } = renderApp('/signup?next=%2Fbroadcasts%2F3')

  expect(
    await within(await screen.findByRole('main')).findByRole('link', { name: '로그인' }),
  ).toHaveAttribute('href', '/login?next=%2Fbroadcasts%2F3')
  await fill(user, VALID)
  await submit(user)

  await within(screen.getByRole('banner')).findByRole('button', { name: '방송러' })
  expect(router.state.location.pathname).toBe('/broadcasts/3')
})

it('로그인 화면으로 바로 갈 수 있다', async () => {
  renderApp('/signup')

  expect(
    await within(await screen.findByRole('main')).findByRole('link', { name: '로그인' }),
  ).toHaveAttribute('href', '/login')
})

it('이미 로그인한 상태로 들어오면 목록으로 보낸다', async () => {
  signedInAs('방송러')
  emptyBroadcastList()
  const { router } = renderApp('/signup')

  await within(screen.getByRole('banner')).findByRole('button', { name: '방송러' })

  expect(router.state.location.pathname).toBe('/')
})
