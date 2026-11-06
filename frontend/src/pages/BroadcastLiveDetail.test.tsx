import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it, vi } from 'vitest'
import type { SignalingChannel, SignalingHandlers, SignalMessage } from '../live/broadcaster'
import type { ViewerDeps } from '../live/viewer'
import { createFakePeer, type FakePeer } from '../test/fakePeer'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

// 실제 WebSocket과 PeerConnection 대신 가짜를 넣는다. 서버 쪽 동작은 fake.server로 일으킨다.
const fake = vi.hoisted(() => ({
  deps: {} as ViewerDeps,
  sent: [] as SignalMessage[],
  handlers: null as SignalingHandlers | null,
  peers: [] as FakePeer[],
  closeSignaling: null as (() => void) | null,
}))

vi.mock('../live/browser-deps', () => ({
  browserViewerDeps: new Proxy({} as ViewerDeps, {
    get: (_target, key: string) => (fake.deps as unknown as Record<string, unknown>)[key],
  }),
}))

beforeEach(() => {
  fake.sent = []
  fake.handlers = null
  fake.peers = []
  fake.closeSignaling = vi.fn()
  fake.deps = {
    openSignaling: async (_id: number, handlers: SignalingHandlers): Promise<SignalingChannel> => {
      fake.handlers = handlers
      return { send: (message) => void fake.sent.push(message), close: fake.closeSignaling as () => void }
    },
    createPeerConnection: () => {
      const peer = createFakePeer()
      fake.peers.push(peer)
      return peer
    },
  }
})

function serverSends(message: SignalMessage) {
  act(() => fake.handlers?.onMessage(message))
}

function liveDetail(status: 'ON_AIR' | 'ENDED', endedAt: string | null) {
  return {
    id: 5,
    kind: 'LIVE',
    title: '상세 라이브',
    createdAt: '2026-03-15T12:00:00Z',
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
            thumbnailUrl: null,
            status: 'ON_AIR',
          },
          {
            id: 4,
            kind: 'RECORDING',
            title: '다른 녹화',
            createdAt: '2026-03-14T12:00:00Z',
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

  renderApp('/broadcasts/5')

  expect(await screen.findByRole('heading', { name: '상세 라이브' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('연결 중…')
  expect(screen.getByText(/^시작/)).toHaveTextContent('2026.03.15')
  expect(screen.queryByText(/^종료/)).not.toBeInTheDocument()
  expect(screen.queryByText('방송이 종료되었습니다')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('영상 플레이어')).not.toBeInTheDocument()
})

it('종료된 라이브방송은 종료 문구와 시작·종료 시각을 보여 주고 시청 연결을 만들지 않는다', async () => {
  stubLive('ENDED', '2026-03-15T13:30:00Z')

  renderApp('/broadcasts/5')

  expect(await screen.findByText('방송이 종료되었습니다')).toBeInTheDocument()
  expect(fake.handlers).toBeNull()
  expect(screen.getByText(/^시작/)).toBeInTheDocument()
  expect(screen.getByText(/^종료/)).toBeInTheDocument()
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
  renderApp('/broadcasts/5')
  await screen.findByRole('heading', { name: '상세 라이브' })
  await waitFor(() => expect(fake.sent).toEqual([{ type: 'join-viewer' }]))
}

async function startPlaying() {
  await openOnAir()
  serverSends({ type: 'joined', viewerId: '1' })
  serverSends({ type: 'offer', sdp: 'remote-offer' })
  await waitFor(() => expect(fake.peers).toHaveLength(1))
  act(() => fake.peers[0].emitTrack({ id: 'remote' } as unknown as MediaStream))
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
  await startPlaying()
  await screen.findByLabelText('라이브 영상')

  serverSends({ type: 'ended' })

  expect(await screen.findByText('방송이 종료되었습니다')).toBeInTheDocument()
  expect(screen.queryByLabelText('라이브 영상')).not.toBeInTheDocument()
})

it('목록에는 방송 중이었지만 이미 끝난 방송이면 종료 문구가 나온다', async () => {
  await openOnAir()

  serverSends({ type: 'rejected', reason: 'ended' })

  expect(await screen.findByText('방송이 종료되었습니다')).toBeInTheDocument()
})

it('연결에 실패하면 실패 문구가 나온다', async () => {
  await openOnAir()

  act(() => fake.handlers?.onClose())

  expect(await screen.findByText(/연결하지 못했습니다/)).toBeInTheDocument()
})

it('상세 화면을 떠나면 시청 연결을 정리한다', async () => {
  await startPlaying()
  const user = userEvent.setup()
  const panel = await screen.findByRole('complementary', { name: '방송 더보기' })

  await user.click(await within(panel).findByRole('link', { name: /다른 녹화/ }))

  await waitFor(() => expect(fake.peers[0].closed).toBe(true))
  expect(fake.closeSignaling).toHaveBeenCalled()
})
