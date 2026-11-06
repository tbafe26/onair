import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import { signedInAs } from '../test/auth'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

it.each([
  ['/broadcasts/new', '%2Fbroadcasts%2Fnew'],
  ['/broadcasts/live/new', '%2Fbroadcasts%2Flive%2Fnew'],
])('비로그인으로 %s에 들어가면 로그인 화면으로 보낸다', async (path, encoded) => {
  const { router } = renderApp(path)

  expect(await screen.findByRole('heading', { name: '로그인' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/login')
  expect(router.state.location.search).toBe(`?next=${encoded}`)
})

it('로그인하면 등록 화면으로 돌아온다', async () => {
  server.use(
    http.get('/api/broadcasts/upload-policy', () =>
      HttpResponse.json({ maxVideoBytes: 1000, maxThumbnailBytes: 1000, maxTitleLength: 100 }),
    ),
    http.post('/api/auth/login', () => HttpResponse.json({ id: 1, loginId: 'streamer01', nickname: '방송러' })),
  )
  const user = userEvent.setup()
  const { router } = renderApp('/broadcasts/new')

  await user.type(await screen.findByLabelText('아이디'), 'streamer01')
  await user.type(screen.getByLabelText('비밀번호'), 'password-1234')
  await user.click(screen.getByRole('button', { name: '로그인' }))

  expect(await screen.findByLabelText('영상 파일')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/broadcasts/new')
})

it('로그인한 사용자는 로그인 화면을 거치지 않고 등록 화면을 본다', async () => {
  signedInAs()
  server.use(
    http.get('/api/broadcasts/upload-policy', () =>
      HttpResponse.json({ maxVideoBytes: 1000, maxThumbnailBytes: 1000, maxTitleLength: 100 }),
    ),
  )
  const { router } = renderApp('/broadcasts/new')

  expect(await screen.findByLabelText('영상 파일')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/broadcasts/new')
})
