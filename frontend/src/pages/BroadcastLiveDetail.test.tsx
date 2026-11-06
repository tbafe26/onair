import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, it } from 'vitest'
import type { ViewerState } from '../live/viewer'
import { signedInAs } from '../test/auth'
import { fakeStream } from '../test/fakeLive'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

// 화면 테스트는 가짜 시청 모듈의 상태를 직접 바꿔 화면만 확인한다. 시그널링 동작은 live/viewer.test.ts가 맡는다.
type App = ReturnType<typeof renderApp>

function setViewer(app: App, state: ViewerState) {
  act(() => app.fake.viewer.setState(state))
}

function liveDetail(status: 'ON_AIR' | 'ENDED', endedAt: string | null) {
  return {
    id: 5,
    kind: 'LIVE',
    title: '상세 라이브',
    createdAt: '2026-03-15T12:00:00Z',
    owner: { id: 1, nickname: '방송러' },
    thumbnailUrl: null,
    status,
    endedAt,
  }
}

function stubLive(status: 'ON_AIR' | 'ENDED', endedAt: string | null) {
  server.use(
    http.get('/api/broadcasts/5', () => HttpResponse.json(liveDetail(status, endedAt))),
    http.get('/api/broadcasts', () =>
      HttpResponse.json({
        items: [
          {
            id: 6,
            kind: 'LIVE',
            title: '다른 라이브',
            createdAt: '2026-03-15T12:00:00Z',
            owner: { id: 1, nickname: '방송러' },
            thumbnailUrl: null,
            status: 'ON_AIR',
          },
          {
            id: 4,
            kind: 'RECORDING',
            title: '다른 녹화',
            createdAt: '2026-03-14T12:00:00Z',
            owner: { id: 1, nickname: '방송러' },
            durationSeconds: 30,
            thumbnailUrl: null,
          },
        ],
        hasNext: false,
      }),
    ),
  )
}

it('방송 중인 라이브방송은 연결 중 문구, 제목, 시작 시각을 보여 주고 종료 시각과 녹화 플레이어는 없다', async () => {
  stubLive('ON_AIR', null)

  const app = renderApp('/broadcasts/5')

  expect(await screen.findByRole('heading', { name: '상세 라이브' })).toBeInTheDocument()
  expect(app.fake.createViewer).toHaveBeenCalledWith(5)
  expect(app.fake.viewer.join).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status')).toHaveTextContent('연결 중…')
  expect(screen.getByText(/^시작/)).toHaveTextContent('2026.03.15')
  expect(screen.queryByText(/^종료/)).not.toBeInTheDocument()
  expect(screen.queryByText('방송이 종료되었습니다')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('영상 플레이어')).not.toBeInTheDocument()
})

it('종료된 라이브방송은 종료 문구와 시작·종료 시각을 보여 주고 시청 연결을 만들지 않는다', async () => {
  stubLive('ENDED', '2026-03-15T13:30:00Z')

  const app = renderApp('/broadcasts/5')

  expect(await screen.findByText('방송이 종료되었습니다')).toBeInTheDocument()
  expect(app.fake.createViewer).not.toHaveBeenCalled()
  expect(screen.getByText(/^시작/)).toBeInTheDocument()
  expect(screen.getByText(/^종료/)).toBeInTheDocument()
})

it('종료된 라이브방송 상세는 고른 썸네일을 깔고, 없으면 기본 이미지를 보여 준다', async () => {
  server.use(
    http.get('/api/broadcasts/5', () =>
      HttpResponse.json({
        ...liveDetail('ENDED', '2026-03-15T13:30:00Z'),
        thumbnailUrl: '/api/broadcasts/5/thumbnail',
      }),
    ),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )
  const first = renderApp('/broadcasts/5')
  await screen.findByText('방송이 종료되었습니다')
  expect(first.container.querySelector('img')).toHaveAttribute('src', '/api/broadcasts/5/thumbnail')
  first.unmount()

  stubLive('ENDED', '2026-03-15T13:30:00Z')
  const second = renderApp('/broadcasts/5')
  await screen.findByText('방송이 종료되었습니다')
  expect(second.container.querySelector('img')).toBeNull()
  expect(screen.getAllByRole('img', { name: '썸네일 없음' }).length).toBeGreaterThan(0)
})

it('라이브방송 상세에도 다른 방송 패널이 있다', async () => {
  stubLive('ON_AIR', null)

  renderApp('/broadcasts/5')

  const panel = await screen.findByRole('complementary', { name: '방송 더보기' })
  expect(await within(panel).findByRole('link', { name: /다른 라이브/ })).toHaveAttribute(
    'href',
    '/broadcasts/6',
  )
  expect(within(panel).getByRole('link', { name: /다른 녹화/ })).toHaveAttribute(
    'href',
    '/broadcasts/4',
  )
})

async function openOnAir() {
  stubLive('ON_AIR', null)
  const app = renderApp('/broadcasts/5')
  await screen.findByRole('heading', { name: '상세 라이브' })
  await waitFor(() => expect(app.fake.viewer.join).toHaveBeenCalled())
  return app
}

async function startPlaying() {
  const app = await openOnAir()
  setViewer(app, { phase: 'playing', stream: fakeStream() })
  return app
}

it('영상이 오면 소리 없이 자동 재생되는 영상과 소리 켜기 버튼이 보이고 재생 막대는 없다', async () => {
  await startPlaying()

  const video = await screen.findByLabelText<HTMLVideoElement>('라이브 영상')
  expect(video.muted).toBe(true)
  expect(video.autoplay).toBe(true)
  expect(video.playsInline).toBe(true)
  expect(video.controls).toBe(false)
  expect(screen.queryByText('연결 중…')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '소리 켜기' })).toBeInTheDocument()
})

it('소리 켜기를 누르면 소리가 켜지고 버튼이 사라진다', async () => {
  await startPlaying()
  const video = await screen.findByLabelText<HTMLVideoElement>('라이브 영상')

  await userEvent.setup().click(screen.getByRole('button', { name: '소리 켜기' }))

  expect(video.muted).toBe(false)
  expect(screen.queryByRole('button', { name: '소리 켜기' })).not.toBeInTheDocument()
})

it('시청 중 송출이 끝나면 영상 자리에 종료 문구가 나온다', async () => {
  const app = await startPlaying()
  await screen.findByLabelText('라이브 영상')

  setViewer(app, { phase: 'ended' })

  expect(await screen.findByText('방송이 종료되었습니다')).toBeInTheDocument()
  expect(screen.queryByLabelText('라이브 영상')).not.toBeInTheDocument()
})

it('시청자가 가득 찼으면 상한 안내 문구가 나온다', async () => {
  const app = await openOnAir()

  setViewer(app, { phase: 'full' })

  expect(await screen.findByText('시청자가 많아 지금은 볼 수 없습니다')).toBeInTheDocument()
  expect(screen.queryByLabelText('라이브 영상')).not.toBeInTheDocument()
})

it('연결에 실패하면 모듈이 준 실패 문구가 나온다', async () => {
  const app = await openOnAir()

  setViewer(app, { phase: 'failed', message: '방송에 연결하지 못했습니다.' })

  expect(await screen.findByText(/연결하지 못했습니다/)).toBeInTheDocument()
  expect(screen.queryByLabelText('라이브 영상')).not.toBeInTheDocument()
})

it('상세 화면을 떠나면 시청 모듈을 정리한다', async () => {
  const app = await startPlaying()
  const user = userEvent.setup()
  const panel = await screen.findByRole('complementary', { name: '방송 더보기' })
  expect(app.fake.viewer.dispose).not.toHaveBeenCalled()

  await user.click(await within(panel).findByRole('link', { name: /다른 녹화/ }))

  await waitFor(() => expect(app.fake.viewer.dispose).toHaveBeenCalled())
})

it('라이브방송 상세에 소유자 닉네임을 보여 준다', async () => {
  server.use(
    http.get('/api/broadcasts/5', () =>
      HttpResponse.json({ ...liveDetail('ENDED', '2026-03-15T13:00:00Z'), owner: { id: 9, nickname: '소유자닉' } }),
    ),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )

  renderApp('/broadcasts/5')

  await screen.findByRole('heading', { name: '상세 라이브' })
  expect(screen.getByText('소유자닉')).toBeInTheDocument()
})

it('소유자의 방송 중 상세에는 송출 종료 버튼이 있고, 확인하면 종료 상태로 바뀐다', async () => {
  signedInAs()
  stubLive('ON_AIR', null)
  let ended = false
  server.use(
    http.get('/api/broadcasts/5', () =>
      HttpResponse.json(ended ? liveDetail('ENDED', '2026-03-15T13:00:00Z') : liveDetail('ON_AIR', null)),
    ),
    http.post('/api/broadcasts/5/end', () => {
      ended = true
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const user = userEvent.setup()
  renderApp('/broadcasts/5')

  await user.click(await screen.findByRole('button', { name: '송출 종료' }))
  await user.click(within(screen.getByRole('dialog', { name: '송출 종료' })).getByRole('button', { name: '송출 종료' }))

  expect(await screen.findByText('방송이 종료되었습니다')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '송출 종료' })).not.toBeInTheDocument()
})

it('종료된 라이브방송의 상세에는 송출 종료 버튼이 없다', async () => {
  signedInAs()
  stubLive('ENDED', '2026-03-15T13:00:00Z')
  renderApp('/broadcasts/5')
  await screen.findByText('방송이 종료되었습니다')
  expect(screen.queryByRole('button', { name: '송출 종료' })).not.toBeInTheDocument()
})

it('비로그인 상태의 방송 중 상세에는 송출 종료 버튼이 없다', async () => {
  stubLive('ON_AIR', null)
  renderApp('/broadcasts/5')
  await screen.findByRole('heading', { name: '상세 라이브' })
  expect(screen.queryByRole('button', { name: '송출 종료' })).not.toBeInTheDocument()
})
