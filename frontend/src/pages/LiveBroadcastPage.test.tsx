import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThumbnailImageDeps } from '../lib/thumbnail-image'
import type { BroadcasterState, CameraUnavailableReason } from '../live/broadcaster'
import { fakeStream } from '../test/fakeLive'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

// 화면 테스트는 가짜 송출 모듈의 상태를 직접 바꿔 화면만 확인한다. 시그널링과 카메라 동작은 live/broadcaster.test.ts가 맡는다.
const images = vi.hoisted(() => ({ deps: {} as ThumbnailImageDeps }))

vi.mock('../lib/thumbnail-image-browser', () => ({
  browserImageDeps: new Proxy({} as ThumbnailImageDeps, {
    get: (_target, key: string) => (images.deps as unknown as Record<string, unknown>)[key],
  }),
}))

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  images.deps = {
    decode: async () => ({ width: 4000, height: 3000, source: null, release: () => {} }),
    encodeJpeg: async () => new Blob([new Uint8Array(500)], { type: 'image/jpeg' }),
  }
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

type App = ReturnType<typeof renderApp>

function setState(app: App, state: BroadcasterState) {
  act(() => app.fake.broadcaster.setState(state))
}

function preview(app: App, overrides: { startFailure?: string; startFieldErrors?: Record<string, string> } = {}) {
  setState(app, {
    phase: 'previewing',
    stream: fakeStream(),
    startFailure: overrides.startFailure ?? null,
    startFieldErrors: overrides.startFieldErrors ?? {},
  })
}

function goOnAir(app: App, extra: { viewerCount?: number; maxViewers?: number | null; startedAt?: number } = {}) {
  setState(app, {
    phase: 'onAir',
    stream: fakeStream(),
    broadcastId: 7,
    startedAt: extra.startedAt ?? Date.now(),
    viewerCount: extra.viewerCount ?? 0,
    maxViewers: extra.maxViewers ?? null,
  })
}

/** 화면을 열고 카메라가 켜진 미리보기 상태로 만든다. */
async function openPreview() {
  const app = renderApp('/broadcasts/live/new')
  preview(app)
  await screen.findByLabelText('제목')
  return app
}

/** 화면을 열고 송출 중 상태로 만든다. */
async function openOnAir(extra: Parameters<typeof goOnAir>[1] = {}) {
  const app = renderApp('/broadcasts/live/new')
  goOnAir(app, extra)
  await screen.findByText('LIVE')
  return app
}

it('화면에 들어오면 카메라를 열고, 떠나면 송출 모듈을 정리한다', async () => {
  const app = renderApp('/broadcasts/live/new')
  expect(app.fake.broadcaster.open).toHaveBeenCalledTimes(1)
  expect(app.fake.broadcaster.dispose).not.toHaveBeenCalled()

  app.unmount()

  expect(app.fake.broadcaster.dispose).toHaveBeenCalledTimes(1)
})

describe.each<[CameraUnavailableReason, string, RegExp]>([
  ['denied', '카메라와 마이크 권한이 거부되었습니다', /허용한 뒤/],
  ['notFound', '카메라를 사용할 수 없습니다', /새로고침/],
  ['insecure', '안전한 연결(HTTPS)이 아니라서 카메라를 켤 수 없습니다', /HTTPS 주소/],
])('카메라를 쓸 수 없을 때(%s)', (reason, title, hint) => {
  it('이유와 해결 방법을 안내하고 송출 시작은 막는다', async () => {
    const app = renderApp('/broadcasts/live/new')

    setState(app, { phase: 'cameraUnavailable', reason })

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(title)).toBeInTheDocument()
    expect(within(alert).getByText(hint)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '송출 시작' })).not.toBeInTheDocument()
  })
})

it('카메라를 켜는 동안 안내하고, 켜지면 미리보기와 제목 입력, 송출 시작 버튼을 보여 준다', async () => {
  const app = renderApp('/broadcasts/live/new')

  expect(screen.getByRole('status')).toHaveTextContent('카메라와 마이크를 켜는 중')
  expect(screen.queryByLabelText('제목')).not.toBeInTheDocument()

  preview(app)

  const video = await screen.findByLabelText('카메라 미리보기')
  expect(video.tagName).toBe('VIDEO')
  expect(video).toHaveAttribute('playsinline')
  expect((video as HTMLVideoElement).muted).toBe(true)
  expect(screen.getByLabelText('제목')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '송출 시작' })).toBeEnabled()
  // 미리보기 중에는 방송이 만들어지지 않는다.
  expect(app.fake.broadcaster.start).not.toHaveBeenCalled()
})

it('제목이 비어 있으면 송출을 시작하지 않고 이유를 보여 준다', async () => {
  const user = userEvent.setup()
  const app = await openPreview()

  await user.click(screen.getByRole('button', { name: '송출 시작' }))

  expect(screen.getByText('제목을 입력하세요')).toBeInTheDocument()
  expect(app.fake.broadcaster.start).not.toHaveBeenCalled()
})

it('제목이 정책의 상한을 넘으면 송출을 시작하지 않고 이유를 보여 준다', async () => {
  const user = userEvent.setup()
  const app = await openPreview()

  await user.click(screen.getByLabelText('제목'))
  await user.paste('가'.repeat(101))
  await user.click(screen.getByRole('button', { name: '송출 시작' }))

  expect(await screen.findByText('제목은 100자 이하로 입력하세요')).toBeInTheDocument()
  expect(screen.getByLabelText('제목')).toHaveAccessibleDescription('제목은 100자 이하로 입력하세요')
  expect(app.fake.broadcaster.start).not.toHaveBeenCalled()
})

it('서버가 돌려준 필드 오류를 입력란 옆에 보여 주고, 제목을 고치면 지운다', async () => {
  const user = userEvent.setup()
  const app = await openPreview()
  await user.type(screen.getByLabelText('제목'), '내 라이브')

  preview(app, {
    startFieldErrors: { title: '서버가 말하는 제목 오류', thumbnail: '서버가 말하는 썸네일 오류' },
  })

  await waitFor(() =>
    expect(screen.getByLabelText('제목')).toHaveAccessibleDescription('서버가 말하는 제목 오류'),
  )
  expect(screen.getByRole('alert')).toHaveTextContent('서버가 말하는 썸네일 오류')
  expect(screen.getByLabelText('제목')).toHaveValue('내 라이브')

  await user.type(screen.getByLabelText('제목'), '!')
  expect(screen.getByLabelText('제목')).not.toHaveAccessibleDescription()
})

it('송출 시작을 누르면 제목을 모듈에 넘기고, 시작하는 동안에는 버튼을 다시 누를 수 없다', async () => {
  const user = userEvent.setup()
  const app = await openPreview()
  await user.type(screen.getByLabelText('제목'), '내 라이브')

  await user.click(screen.getByRole('button', { name: '송출 시작' }))
  expect(app.fake.broadcaster.start).toHaveBeenCalledWith({ title: '내 라이브', thumbnail: null })
  setState(app, { phase: 'starting', stream: fakeStream() })

  const button = await screen.findByRole('button', { name: '송출 시작 중...' })
  expect(button).toBeDisabled()
  expect(screen.getByLabelText('제목')).toBeDisabled()
  await user.click(button)
  expect(app.fake.broadcaster.start).toHaveBeenCalledTimes(1)
})

it('송출 시작에 실패하면 미리보기로 돌아가 이유를 보여 주고 다시 시도할 수 있다', async () => {
  const user = userEvent.setup()
  const app = await openPreview()
  await user.type(screen.getByLabelText('제목'), '내 라이브')
  await user.click(screen.getByRole('button', { name: '송출 시작' }))
  setState(app, { phase: 'starting', stream: fakeStream() })

  preview(app, { startFailure: '송출을 시작하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' })

  expect(await screen.findByRole('alert')).toHaveTextContent('송출을 시작하지 못했습니다')
  expect(screen.getByLabelText('제목')).toHaveValue('내 라이브')
  await user.click(screen.getByRole('button', { name: '송출 시작' }))
  expect(app.fake.broadcaster.start).toHaveBeenCalledTimes(2)
})

it('송출 중에는 LIVE와 경과 시간을 보여 주고 제목 입력은 없다', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))

  await openOnAir({ startedAt: Date.now() - 65_000 })

  expect(screen.getByText('LIVE')).toBeInTheDocument()
  expect(screen.getByText('01:05')).toBeInTheDocument()
  expect(screen.queryByLabelText('제목')).not.toBeInTheDocument()
})

it('송출 종료는 확인을 거치고, 취소하면 계속 방송한다', async () => {
  const user = userEvent.setup()
  const app = await openOnAir()

  await user.click(screen.getByRole('button', { name: '송출 종료' }))
  const dialog = screen.getByRole('alertdialog', { name: '송출 종료 확인' })
  expect(within(dialog).getByText('송출을 종료할까요?')).toBeInTheDocument()
  expect(app.fake.broadcaster.end).not.toHaveBeenCalled()

  await user.click(within(dialog).getByRole('button', { name: '취소' }))

  expect(screen.getByText('LIVE')).toBeInTheDocument()
  expect(app.fake.broadcaster.end).not.toHaveBeenCalled()
})

it('종료를 확인하면 송출 모듈에 종료를 맡기고, 방송이 끝나면 그 방송의 상세로 이동한다', async () => {
  const user = userEvent.setup()
  const app = await openOnAir()

  await user.click(screen.getByRole('button', { name: '송출 종료' }))
  await user.click(
    within(screen.getByRole('alertdialog', { name: '송출 종료 확인' })).getByRole('button', {
      name: '종료',
    }),
  )
  expect(app.fake.broadcaster.end).toHaveBeenCalledTimes(1)
  setState(app, { phase: 'ended', broadcastId: 7 })

  expect(await screen.findByRole('heading', { name: '내 라이브' })).toBeInTheDocument()
  expect(app.router.state.location.pathname).toBe('/broadcasts/7')
  expect(screen.getByText('방송이 종료되었습니다')).toBeInTheDocument()
})

it('송출 중에 다른 화면으로 가려 하면 확인을 받고, 계속 방송을 고르면 머무른다', async () => {
  const user = userEvent.setup()
  const app = await openOnAir()

  await user.click(screen.getByRole('link', { name: '온에어' }))
  const dialog = await screen.findByRole('alertdialog', { name: '화면 이동 확인' })
  await user.click(within(dialog).getByRole('button', { name: '계속 방송' }))

  expect(app.router.state.location.pathname).toBe('/broadcasts/live/new')
  expect(screen.getByText('LIVE')).toBeInTheDocument()
})

it('송출 중에 탭을 닫거나 새로고침하려 하면 브라우저 확인을 띄우고, 송출 전에는 띄우지 않는다', async () => {
  const app = await openPreview()
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true)

  goOnAir(app)
  await screen.findByText('LIVE')

  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false)
})

it('송출 중에는 현재 시청자 수를 보여 주고, 바뀌면 따라간다', async () => {
  const app = await openOnAir()
  expect(screen.getByText('시청자 0명')).toBeInTheDocument()

  goOnAir(app, { viewerCount: 2 })
  expect(await screen.findByText('시청자 2명')).toBeInTheDocument()

  goOnAir(app, { viewerCount: 1 })
  expect(await screen.findByText('시청자 1명')).toBeInTheDocument()
})

it('상한을 받으면 시청자 수를 현재/상한으로 보여 준다', async () => {
  await openOnAir({ viewerCount: 3, maxViewers: 5 })

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

  it('고른 이미지를 변환해 미리 보여 주고, 송출을 시작할 때 JPEG로 함께 보낸다', async () => {
    const user = userEvent.setup()
    const app = await openPreview()

    await user.upload(screen.getByLabelText(/썸네일/), picture)

    expect(await screen.findByRole('img', { name: '썸네일 미리보기' })).toHaveAttribute('src', 'blob:preview-0')
    await user.type(screen.getByLabelText('제목'), '내 라이브')
    await user.click(screen.getByRole('button', { name: '송출 시작' }))

    expect(app.fake.broadcaster.start).toHaveBeenCalledTimes(1)
    const sent = app.fake.broadcaster.start.mock.calls[0][0]
    expect(sent.title).toBe('내 라이브')
    expect(sent.thumbnail?.type).toBe('image/jpeg')
  })

  it('고르지 않으면 썸네일 없이 시작한다', async () => {
    const user = userEvent.setup()
    const app = await openPreview()

    await user.type(screen.getByLabelText('제목'), '내 라이브')
    await user.click(screen.getByRole('button', { name: '송출 시작' }))

    expect(app.fake.broadcaster.start).toHaveBeenCalledTimes(1)
    expect(app.fake.broadcaster.start.mock.calls[0][0].thumbnail).toBeNull()
  })

  it('선택을 취소하면 미리보기가 사라지고 주소를 해제하며, 썸네일 없이 시작한다', async () => {
    const user = userEvent.setup()
    const app = await openPreview()
    await user.upload(screen.getByLabelText(/썸네일/), picture)
    await screen.findByRole('img', { name: '썸네일 미리보기' })

    await user.click(screen.getByRole('button', { name: '썸네일 선택 취소' }))

    expect(screen.queryByRole('img', { name: '썸네일 미리보기' })).not.toBeInTheDocument()
    expect(revoked).toEqual(['blob:preview-0'])
    await user.type(screen.getByLabelText('제목'), '내 라이브')
    await user.click(screen.getByRole('button', { name: '송출 시작' }))
    expect(app.fake.broadcaster.start).toHaveBeenCalledTimes(1)
    expect(app.fake.broadcaster.start.mock.calls[0][0].thumbnail).toBeNull()
  })

  it('다른 이미지를 고르면 이전 미리보기 주소를 해제하고, 화면을 떠나면 마지막 주소도 해제한다', async () => {
    const user = userEvent.setup()
    const app = await openPreview()
    const input = screen.getByLabelText(/썸네일/)
    await user.upload(input, picture)
    await waitFor(() => expect(created).toEqual(['blob:preview-0']))

    await user.upload(input, new File(['other'], 'other.webp', { type: 'image/webp' }))
    await waitFor(() => expect(created).toHaveLength(2))
    expect(revoked).toEqual(['blob:preview-0'])

    app.unmount()
    expect(revoked).toEqual(['blob:preview-0', 'blob:preview-1'])
  })

  it('브라우저가 열지 못하는 파일은 쓸 수 없다고 안내하고, 썸네일 없이 송출할 수 있다', async () => {
    images.deps.decode = async () => {
      throw new Error('열 수 없음')
    }
    const user = userEvent.setup()
    const app = await openPreview()

    await user.upload(screen.getByLabelText(/썸네일/), new File(['x'], 'doc.heic', { type: 'image/heic' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('썸네일로 쓸 수 없습니다')
    expect(screen.queryByRole('img', { name: '썸네일 미리보기' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('제목'), '내 라이브')
    await user.click(screen.getByRole('button', { name: '송출 시작' }))
    expect(app.fake.broadcaster.start).toHaveBeenCalledTimes(1)
    expect(app.fake.broadcaster.start.mock.calls[0][0].thumbnail).toBeNull()
  })

  it('송출을 시작하는 동안에는 썸네일을 바꾸거나 취소할 수 없다', async () => {
    const user = userEvent.setup()
    const app = await openPreview()
    await user.upload(screen.getByLabelText(/썸네일/), picture)
    await screen.findByRole('img', { name: '썸네일 미리보기' })
    await user.type(screen.getByLabelText('제목'), '내 라이브')

    setState(app, { phase: 'starting', stream: fakeStream() })

    expect(await screen.findByLabelText(/썸네일/)).toBeDisabled()
    expect(screen.getByRole('button', { name: '썸네일 선택 취소' })).toBeDisabled()
  })
})

describe('카메라 전환 버튼', () => {
  it('카메라가 둘이면 미리보기 중에 전환을 요청하고, 바뀐 카메라를 안내한다', async () => {
    const user = userEvent.setup()
    const app = await openPreview()
    act(() => app.fake.broadcaster.setCamera({ canSwitch: true }))

    expect(await screen.findByText('현재 전면 카메라')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '카메라 전환' }))
    expect(app.fake.broadcaster.switchCamera).toHaveBeenCalledTimes(1)
    act(() => app.fake.broadcaster.setCamera({ facing: 'environment' }))

    expect(await screen.findByText('현재 후면 카메라')).toBeInTheDocument()
  })

  it('전환하는 동안에는 버튼이 막히고, 전환에 실패하면 이유를 보여 준다', async () => {
    const app = await openPreview()
    act(() => app.fake.broadcaster.setCamera({ canSwitch: true, switching: true }))
    expect(await screen.findByRole('button', { name: '카메라 전환' })).toBeDisabled()

    act(() => app.fake.broadcaster.setCamera({ switching: false, switchFailure: '카메라를 바꾸지 못했습니다' }))

    expect(screen.getByRole('button', { name: '카메라 전환' })).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent('카메라를 바꾸지 못했습니다')
  })

  it('카메라가 하나뿐이면 전환 버튼이 없다', async () => {
    await openPreview()

    expect(screen.queryByRole('button', { name: '카메라 전환' })).not.toBeInTheDocument()
  })

  it('송출 중에는 전환 버튼이 막힌다', async () => {
    const app = await openPreview()
    act(() => app.fake.broadcaster.setCamera({ canSwitch: true }))
    await screen.findByRole('button', { name: '카메라 전환' })

    goOnAir(app)

    expect(await screen.findByRole('button', { name: '카메라 전환' })).toBeDisabled()
  })
})
