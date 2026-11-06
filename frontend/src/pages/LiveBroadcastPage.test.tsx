import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThumbnailImageDeps } from '../lib/thumbnail-image'
import type {
  BroadcasterDeps,
  SignalingChannel,
  SignalingHandlers,
  SignalMessage,
} from '../live/broadcaster'
import { createFakePeer, type FakePeer } from '../test/fakePeer'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

// 실제 카메라와 WebSocket 대신 가짜를 넣는다. 서버 쪽 동작은 fake.server로 일으킨다.
const fake = vi.hoisted(() => ({
  deps: {} as BroadcasterDeps,
  sent: [] as SignalMessage[],
  handlers: null as SignalingHandlers | null,
  tracks: [] as { stop: () => void }[],
  peers: [] as FakePeer[],
  images: {} as ThumbnailImageDeps,
}))

vi.mock('../lib/thumbnail-image-browser', () => ({
  browserImageDeps: new Proxy({} as ThumbnailImageDeps, {
    get: (_target, key: string) => (fake.images as unknown as Record<string, unknown>)[key],
  }),
}))

vi.mock('../live/browser-deps', () => ({
  browserBroadcasterDeps: new Proxy({} as BroadcasterDeps, {
    get: (_target, key: string) => (fake.deps as unknown as Record<string, unknown>)[key],
  }),
}))

function error(name: string) {
  const e = new Error(name)
  e.name = name
  return e
}

function resetFake(overrides: Partial<BroadcasterDeps> = {}) {
  fake.sent = []
  fake.handlers = null
  fake.peers = []
  fake.tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  fake.images = {
    decode: async () => ({ width: 4000, height: 3000, source: null, release: () => {} }),
    encodeJpeg: async () => new Blob([new Uint8Array(500)], { type: 'image/jpeg' }),
  }
  const stream = { getTracks: () => fake.tracks } as unknown as MediaStream
  fake.deps = {
    getUserMedia: async () => stream,
    startLive: async () => ({ id: 7, streamKey: 'fake-stream-key' }),
    openSignaling: async (_id: number, handlers: SignalingHandlers): Promise<SignalingChannel> => {
      fake.handlers = handlers
      return { send: (message) => void fake.sent.push(message), close: () => {} }
    },
    createPeerConnection: () => {
      const peer = createFakePeer()
      fake.peers.push(peer)
      return peer
    },
    now: () => Date.now() - 65_000,
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  resetFake()
  server.use(
    http.get('/api/broadcasts/upload-policy', () =>
      HttpResponse.json({ maxVideoBytes: 1000, maxThumbnailBytes: 2 * 1024 * 1024, maxTitleLength: 100 }),
    ),
    http.get('/api/broadcasts/7', () =>
      HttpResponse.json({
        id: 7,
        kind: 'LIVE',
        title: '내 라이브',
        createdAt: '2026-03-15T12:00:00Z',
        thumbnailUrl: null,
        status: 'ENDED',
        endedAt: '2026-03-15T12:10:00Z',
      }),
    ),
    http.get('/api/broadcasts', () => HttpResponse.json({ items: [], hasNext: false })),
  )
})

async function startOnAir(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('제목'), '내 라이브')
  await user.click(screen.getByRole('button', { name: '송출 시작' }))
  await waitFor(() => expect(fake.sent).toHaveLength(1))
  fake.handlers?.onMessage({ type: 'joined' })
  await screen.findByText('LIVE')
}

it('카메라 권한을 거부하면 이유와 다시 허용하는 방법을 보여 준다', async () => {
  resetFake({
    getUserMedia: async () => {
      throw error('NotAllowedError')
    },
  })

  renderApp('/broadcasts/live/new')

  const alert = await screen.findByRole('alert')
  expect(within(alert).getByText('카메라와 마이크 권한이 거부되었습니다')).toBeInTheDocument()
  expect(within(alert).getByText(/허용한 뒤/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '송출 시작' })).not.toBeInTheDocument()
})

it('카메라가 없거나 쓸 수 없으면 그 사실을 안내한다', async () => {
  resetFake({
    getUserMedia: async () => {
      throw error('NotFoundError')
    },
  })

  renderApp('/broadcasts/live/new')

  expect(await screen.findByText('카메라를 사용할 수 없습니다')).toBeInTheDocument()
})

it('HTTPS가 아니면 HTTPS 주소로 접속하라고 안내한다', async () => {
  resetFake({ getUserMedia: null })

  renderApp('/broadcasts/live/new')

  expect(
    await screen.findByText('안전한 연결(HTTPS)이 아니라서 카메라를 켤 수 없습니다'),
  ).toBeInTheDocument()
  expect(screen.getByText(/HTTPS 주소/)).toBeInTheDocument()
})

it('카메라를 켜는 동안 안내하고, 켜지면 미리보기와 제목 입력, 송출 시작 버튼을 보여 준다', async () => {
  renderApp('/broadcasts/live/new')

  expect(screen.getByRole('status')).toHaveTextContent('카메라와 마이크를 켜는 중')
  const video = await screen.findByLabelText('카메라 미리보기')
  expect(video.tagName).toBe('VIDEO')
  expect(video).toHaveAttribute('playsinline')
  expect((video as HTMLVideoElement).muted).toBe(true)
  expect(screen.getByLabelText('제목')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '송출 시작' })).toBeEnabled()
  // 미리보기 중에는 방송이 만들어지지 않는다.
  expect(fake.sent).toEqual([])
})

it('제목이 비어 있으면 송출을 시작하지 않고 이유를 보여 준다', async () => {
  const startLive = vi.fn(async () => ({ id: 7, streamKey: 'fake-stream-key' }))
  resetFake({ startLive })
  const user = userEvent.setup()
  renderApp('/broadcasts/live/new')

  await user.click(await screen.findByRole('button', { name: '송출 시작' }))

  expect(screen.getByText('제목을 입력하세요')).toBeInTheDocument()
  expect(startLive).not.toHaveBeenCalled()
})

it('송출을 시작하는 동안에는 버튼을 다시 누를 수 없다', async () => {
  const startLive = vi.fn(() => new Promise<{ id: number; streamKey: string }>(() => {}))
  resetFake({ startLive })
  const user = userEvent.setup()
  renderApp('/broadcasts/live/new')

  await user.type(await screen.findByLabelText('제목'), '내 라이브')
  await user.click(screen.getByRole('button', { name: '송출 시작' }))

  const button = await screen.findByRole('button', { name: '송출 시작 중...' })
  expect(button).toBeDisabled()
  await user.click(button)
  expect(startLive).toHaveBeenCalledTimes(1)
})

it('송출 시작에 실패하면 미리보기로 돌아가 이유를 보여 주고 다시 시도할 수 있다', async () => {
  const startLive = vi
    .fn<BroadcasterDeps['startLive']>()
    .mockRejectedValueOnce(new Error('송출을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'))
    .mockResolvedValue({ id: 7, streamKey: 'fake-stream-key' })
  resetFake({ startLive })
  const user = userEvent.setup()
  renderApp('/broadcasts/live/new')

  await user.type(await screen.findByLabelText('제목'), '내 라이브')
  await user.click(screen.getByRole('button', { name: '송출 시작' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('송출을 시작하지 못했습니다')
  expect(screen.getByLabelText('제목')).toHaveValue('내 라이브')
  await user.click(screen.getByRole('button', { name: '송출 시작' }))
  await waitFor(() => expect(fake.sent).toHaveLength(1))
  expect(startLive).toHaveBeenCalledTimes(2)
})

it('송출 중에는 LIVE와 경과 시간을 보여 주고 제목 입력은 없다', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
  const user = userEvent.setup()
  renderApp('/broadcasts/live/new')

  await startOnAir(user)

  expect(screen.getByText('LIVE')).toBeInTheDocument()
  expect(screen.getByText('01:05')).toBeInTheDocument()
  expect(screen.queryByLabelText('제목')).not.toBeInTheDocument()
  expect(fake.sent[0]).toEqual({ type: 'join-broadcaster', streamKey: 'fake-stream-key' })
})

it('송출 종료는 확인을 거치고, 취소하면 계속 방송한다', async () => {
  const user = userEvent.setup()
  renderApp('/broadcasts/live/new')
  await startOnAir(user)

  await user.click(screen.getByRole('button', { name: '송출 종료' }))
  const dialog = screen.getByRole('alertdialog', { name: '송출 종료 확인' })
  expect(within(dialog).getByText('송출을 종료할까요?')).toBeInTheDocument()
  expect(fake.sent).toHaveLength(1)

  await user.click(within(dialog).getByRole('button', { name: '취소' }))

  expect(screen.getByText('LIVE')).toBeInTheDocument()
  expect(fake.sent).toHaveLength(1)
})

it('종료를 확인하면 end를 보내고, 서버가 확인하면 카메라를 끄고 그 방송의 상세로 이동한다', async () => {
  const user = userEvent.setup()
  const { router } = renderApp('/broadcasts/live/new')
  await startOnAir(user)

  await user.click(screen.getByRole('button', { name: '송출 종료' }))
  await user.click(
    within(screen.getByRole('alertdialog', { name: '송출 종료 확인' })).getByRole('button', {
      name: '종료',
    }),
  )
  await waitFor(() => expect(fake.sent.at(-1)).toEqual({ type: 'end' }))
  fake.handlers?.onMessage({ type: 'ended' })

  expect(await screen.findByRole('heading', { name: '내 라이브' })).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/broadcasts/7')
  expect(screen.getByText('방송이 종료되었습니다')).toBeInTheDocument()
  fake.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled())
})

it('송출 중에 다른 화면으로 가려 하면 확인을 받고, 계속 방송을 고르면 머무른다', async () => {
  const user = userEvent.setup()
  const { router } = renderApp('/broadcasts/live/new')
  await startOnAir(user)

  await user.click(screen.getByRole('link', { name: '온에어' }))
  const dialog = await screen.findByRole('alertdialog', { name: '화면 이동 확인' })
  await user.click(within(dialog).getByRole('button', { name: '계속 방송' }))

  expect(router.state.location.pathname).toBe('/broadcasts/live/new')
  expect(screen.getByText('LIVE')).toBeInTheDocument()
})

it('송출 중에 탭을 닫거나 새로고침하려 하면 브라우저 확인을 띄우고, 송출 전에는 띄우지 않는다', async () => {
  const user = userEvent.setup()
  renderApp('/broadcasts/live/new')
  await screen.findByLabelText('제목')
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true)

  await startOnAir(user)

  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false)
})

it('송출 중에는 현재 시청자 수를 보여 주고, 시청자가 드나들어도 다른 시청자의 연결은 유지한다', async () => {
  const user = userEvent.setup()
  renderApp('/broadcasts/live/new')
  await startOnAir(user)
  expect(screen.getByText('시청자 0명')).toBeInTheDocument()

  act(() => {
    fake.handlers?.onMessage({ type: 'viewer-joined', viewerId: '1' })
    fake.handlers?.onMessage({ type: 'viewer-count', count: 1 })
    fake.handlers?.onMessage({ type: 'viewer-joined', viewerId: '2' })
    fake.handlers?.onMessage({ type: 'viewer-count', count: 2 })
  })
  expect(await screen.findByText('시청자 2명')).toBeInTheDocument()

  act(() => {
    fake.handlers?.onMessage({ type: 'viewer-left', viewerId: '1' })
    fake.handlers?.onMessage({ type: 'viewer-count', count: 1 })
  })

  expect(await screen.findByText('시청자 1명')).toBeInTheDocument()
  expect(fake.peers.map((peer) => peer.closed)).toEqual([true, false])
})

it('상한을 받으면 시청자 수를 현재/상한으로 보여 준다', async () => {
  const user = userEvent.setup()
  renderApp('/broadcasts/live/new')
  await startOnAir(user)

  act(() => {
    fake.handlers?.onMessage({ type: 'viewer-count', count: 3, max: 5 })
  })

  expect(await screen.findByText('시청자 3/5')).toBeInTheDocument()
})

describe('썸네일 선택', () => {
  const created: string[] = []
  const revoked: string[] = []

  beforeEach(() => {
    created.length = 0
    revoked.length = 0
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:preview-${created.length}`
      created.push(url)
      return url
    })
    URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url))
  })

  const picture = new File(['synthetic'], 'photo.png', { type: 'image/png' })

  function startLiveSpy() {
    const startLive = vi.fn<BroadcasterDeps['startLive']>(async () => ({ id: 7, streamKey: 'fake-stream-key' }))
    resetFake({ startLive })
    return startLive
  }

  it('고른 이미지를 변환해 미리 보여 주고, 송출을 시작할 때 JPEG로 함께 보낸다', async () => {
    const startLive = startLiveSpy()
    const user = userEvent.setup()
    renderApp('/broadcasts/live/new')

    await user.upload(await screen.findByLabelText(/썸네일/), picture)

    expect(await screen.findByRole('img', { name: '썸네일 미리보기' })).toHaveAttribute('src', 'blob:preview-0')
    await user.type(screen.getByLabelText('제목'), '내 라이브')
    await user.click(screen.getByRole('button', { name: '송출 시작' }))

    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1))
    const sent = startLive.mock.calls[0][0]
    expect(sent.title).toBe('내 라이브')
    expect(sent.thumbnail?.type).toBe('image/jpeg')
  })

  it('고르지 않으면 썸네일 없이 시작한다', async () => {
    const startLive = startLiveSpy()
    const user = userEvent.setup()
    renderApp('/broadcasts/live/new')

    await user.type(await screen.findByLabelText('제목'), '내 라이브')
    await user.click(screen.getByRole('button', { name: '송출 시작' }))

    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1))
    expect(startLive.mock.calls[0][0].thumbnail).toBeNull()
  })

  it('선택을 취소하면 미리보기가 사라지고 주소를 해제하며, 썸네일 없이 시작한다', async () => {
    const startLive = startLiveSpy()
    const user = userEvent.setup()
    renderApp('/broadcasts/live/new')
    await user.upload(await screen.findByLabelText(/썸네일/), picture)
    await screen.findByRole('img', { name: '썸네일 미리보기' })

    await user.click(screen.getByRole('button', { name: '썸네일 선택 취소' }))

    expect(screen.queryByRole('img', { name: '썸네일 미리보기' })).not.toBeInTheDocument()
    expect(revoked).toEqual(['blob:preview-0'])
    await user.type(screen.getByLabelText('제목'), '내 라이브')
    await user.click(screen.getByRole('button', { name: '송출 시작' }))
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1))
    expect(startLive.mock.calls[0][0].thumbnail).toBeNull()
  })

  it('다른 이미지를 고르면 이전 미리보기 주소를 해제하고, 화면을 떠나면 마지막 주소도 해제한다', async () => {
    const user = userEvent.setup()
    const { unmount } = renderApp('/broadcasts/live/new')
    const input = await screen.findByLabelText(/썸네일/)
    await user.upload(input, picture)
    await waitFor(() => expect(created).toEqual(['blob:preview-0']))

    await user.upload(input, new File(['other'], 'other.webp', { type: 'image/webp' }))
    await waitFor(() => expect(created).toHaveLength(2))
    expect(revoked).toEqual(['blob:preview-0'])

    unmount()
    expect(revoked).toEqual(['blob:preview-0', 'blob:preview-1'])
  })

  it('브라우저가 열지 못하는 파일은 쓸 수 없다고 안내하고, 썸네일 없이 송출할 수 있다', async () => {
    const startLive = startLiveSpy()
    fake.images.decode = async () => {
      throw new Error('열 수 없음')
    }
    const user = userEvent.setup()
    renderApp('/broadcasts/live/new')

    await user.upload(await screen.findByLabelText(/썸네일/), new File(['x'], 'doc.heic', { type: 'image/heic' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('썸네일로 쓸 수 없습니다')
    expect(screen.queryByRole('img', { name: '썸네일 미리보기' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('제목'), '내 라이브')
    await user.click(screen.getByRole('button', { name: '송출 시작' }))
    await waitFor(() => expect(startLive).toHaveBeenCalledTimes(1))
    expect(startLive.mock.calls[0][0].thumbnail).toBeNull()
  })

  it('송출을 시작하는 동안에는 썸네일을 바꾸거나 취소할 수 없다', async () => {
    resetFake({ startLive: () => new Promise<{ id: number; streamKey: string }>(() => {}) })
    const user = userEvent.setup()
    renderApp('/broadcasts/live/new')
    await user.upload(await screen.findByLabelText(/썸네일/), picture)
    await screen.findByRole('img', { name: '썸네일 미리보기' })
    await user.type(screen.getByLabelText('제목'), '내 라이브')

    await user.click(screen.getByRole('button', { name: '송출 시작' }))

    expect(await screen.findByLabelText(/썸네일/)).toBeDisabled()
    expect(screen.getByRole('button', { name: '썸네일 선택 취소' })).toBeDisabled()
  })
})
