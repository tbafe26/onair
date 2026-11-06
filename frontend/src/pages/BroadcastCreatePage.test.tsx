import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ThumbnailImageDeps } from '../lib/thumbnail-image'
import { extractVideoMetadata, releasePreview } from '../lib/video-metadata'
import { renderApp } from '../test/renderApp'
import { server } from '../test/server'

// jsdom에는 미디어 API가 없으므로 썸네일·재생 시간 추출 모듈만 대체한다.
vi.mock('../lib/video-metadata', () => ({
  extractVideoMetadata: vi.fn(),
  releasePreview: vi.fn(),
  VideoUnreadableError: class VideoUnreadableError extends Error {},
}))

// 영상에서 뽑은 프레임도 이미지 변환을 거치므로 jsdom에 없는 브라우저 디코더·캔버스 대신 가짜를 넣는다.
const fakeImages = vi.hoisted(() => ({ deps: {} as ThumbnailImageDeps }))

vi.mock('../lib/thumbnail-image-browser', () => ({
  browserImageDeps: new Proxy({} as ThumbnailImageDeps, {
    get: (_target, key: string) => (fakeImages.deps as unknown as Record<string, unknown>)[key],
  }),
}))

function imagesEncodingTo(sizeByQuality: (quality: number) => number) {
  const qualities: number[] = []
  fakeImages.deps = {
    decode: async () => ({ width: 1920, height: 1080, source: null, release: () => {} }),
    encodeJpeg: async (_image, _width, _height, quality) => {
      qualities.push(quality)
      return new Blob([new Uint8Array(sizeByQuality(quality))], { type: 'image/jpeg' })
    },
  }
  return qualities
}

const mockedExtract = vi.mocked(extractVideoMetadata)

function videoFile() {
  return new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], '내 영상.mp4', {
    type: 'video/mp4',
  })
}

const MB = 1024 * 1024

// 서버가 알려 주는 업로드 정책. 화면은 이 값으로 크기를 검사하고 안내한다.
function uploadPolicyHandler(maxVideoBytes: number) {
  return http.get('/api/broadcasts/upload-policy', () =>
    HttpResponse.json({ maxVideoBytes, maxThumbnailBytes: 2 * MB, maxTitleLength: 100 }),
  )
}

beforeEach(() => {
  mockedExtract.mockReset()
  imagesEncodingTo(() => 10)
  server.use(uploadPolicyHandler(10 * MB))
})

it('파일을 고르면 썸네일 미리보기와 재생 시간을 보여 준다', async () => {
  mockedExtract.mockResolvedValue({
    durationSeconds: 125,
    thumbnail: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
    previewUrl: 'blob:preview-1',
  })
  renderApp('/broadcasts/new')

  await userEvent.upload(screen.getByLabelText('영상 파일'), videoFile())

  expect(await screen.findByAltText('썸네일 미리보기')).toHaveAttribute('src', 'blob:preview-1')
  expect(screen.getByText('재생 시간 02:05')).toBeInTheDocument()
})

it('브라우저가 열 수 없는 영상이면 안내하고 등록을 막는다', async () => {
  const { VideoUnreadableError } = await import('../lib/video-metadata')
  mockedExtract.mockRejectedValue(new VideoUnreadableError())
  renderApp('/broadcasts/new')

  await userEvent.type(screen.getByLabelText('제목'), '깨진 영상')
  await userEvent.upload(screen.getByLabelText('영상 파일'), videoFile())

  expect(await screen.findByText('이 브라우저에서 재생할 수 없는 영상입니다')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
})

it('등록에 성공하면 방금 만든 방송의 상세 화면으로 이동한다', async () => {
  mockedExtract.mockResolvedValue({
    durationSeconds: 30.5,
    thumbnail: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
    previewUrl: 'blob:preview-2',
  })
  let body = ''
  server.use(
    http.post('/api/broadcasts', async ({ request }) => {
      // jsdom이 만든 multipart 본문을 undici가 파싱하지 못해, 본문 글자로 필드를 확인한다.
      body = await request.text()
      return HttpResponse.json(
        {
          id: 42,
          kind: 'RECORDING',
          title: '새 방송',
          createdAt: '2026-03-15T12:00:00Z',
          video: {
            url: '/api/broadcasts/42/video',
            contentType: 'video/mp4',
            sizeBytes: 8,
            durationSeconds: 30.5,
            thumbnailUrl: '/api/broadcasts/42/thumbnail',
          },
        },
        { status: 201, headers: { Location: '/api/broadcasts/42' } },
      )
    }),
    http.get('/api/broadcasts/42', () =>
      HttpResponse.json({
        id: 42,
        kind: 'RECORDING',
        title: '새 방송',
        createdAt: '2026-03-15T12:00:00Z',
        video: {
          url: '/api/broadcasts/42/video',
          contentType: 'video/mp4',
          sizeBytes: 8,
          durationSeconds: 30.5,
          thumbnailUrl: '/api/broadcasts/42/thumbnail',
        },
      }),
    ),
  )
  renderApp('/broadcasts/new')

  await userEvent.type(screen.getByLabelText('제목'), '새 방송')
  await userEvent.upload(screen.getByLabelText('영상 파일'), videoFile())
  await screen.findByAltText('썸네일 미리보기')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))

  expect(await screen.findByRole('heading', { name: '새 방송' })).toBeInTheDocument()
  expect(body).toMatch(/name="title"\r\n\r\n새 방송\r\n/)
  expect(body).toMatch(/name="video"; filename="내 영상\.mp4"/)
  expect(body).toMatch(/name="durationSeconds"\r\n\r\n30\.5\r\n/)
  expect(body).toMatch(/name="thumbnail"; filename="thumbnail\.jpg"/)
})

function policyWithThumbnailLimit(maxThumbnailBytes: number) {
  server.use(
    http.get('/api/broadcasts/upload-policy', () =>
      HttpResponse.json({ maxVideoBytes: 10 * MB, maxThumbnailBytes, maxTitleLength: 100 }),
    ),
  )
}

async function registerWithCapturedFrame(title: string) {
  mockedExtract.mockResolvedValue({
    durationSeconds: 30,
    thumbnail: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
    previewUrl: 'blob:preview-frame',
  })
  let body = ''
  server.use(
    http.post('/api/broadcasts', async ({ request }) => {
      body = await request.text()
      return new HttpResponse(null, { status: 500 })
    }),
  )
  renderApp('/broadcasts/new')
  // 정책을 받은 뒤에 등록해야 썸네일 상한이 적용된다.
  await screen.findByText(/최대 10MB/)

  await userEvent.type(screen.getByLabelText('제목'), title)
  await userEvent.upload(screen.getByLabelText('영상 파일'), videoFile())
  await screen.findByAltText('썸네일 미리보기')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))

  await waitFor(() => expect(body).toMatch(/name="video"/))
  return body
}

it('자동 썸네일이 서버의 썸네일 상한을 넘으면 화질을 낮춰 다시 인코딩해 등록한다', async () => {
  policyWithThumbnailLimit(100)
  const qualities = imagesEncodingTo((quality) => (quality > 0.6 ? 500 : 50))

  const body = await registerWithCapturedFrame('큰 썸네일')

  expect(qualities).toEqual([0.85, 0.7, 0.5])
  expect(body).toMatch(/name="thumbnail"; filename="thumbnail\.jpg"/)
})

it('화질을 낮춰도 서버의 썸네일 상한을 넘으면 썸네일 없이 등록한다', async () => {
  policyWithThumbnailLimit(100)
  const qualities = imagesEncodingTo(() => 500)

  const body = await registerWithCapturedFrame('너무 큰 썸네일')

  expect(qualities).toEqual([0.85, 0.7, 0.5])
  expect(body).not.toMatch(/name="thumbnail"/)
})

const readyInfo = () => ({
  durationSeconds: 30,
  thumbnail: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
  previewUrl: 'blob:preview-v',
})

it('제목을 비우고 등록하면 요청 없이 제목 입력란 옆에 메시지를 보여 준다', async () => {
  mockedExtract.mockResolvedValue(readyInfo())
  renderApp('/broadcasts/new')

  await userEvent.upload(screen.getByLabelText('영상 파일'), videoFile())
  await screen.findByAltText('썸네일 미리보기')
  await userEvent.type(screen.getByLabelText('제목'), '   ')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))

  expect(screen.getByLabelText('제목')).toHaveAccessibleDescription('제목을 입력하세요')
  // 요청이 나갔다면 MSW가 처리되지 않은 요청 오류를 낸다.
})

it('제목이 100자를 넘으면 메시지를 보여 준다', async () => {
  mockedExtract.mockResolvedValue(readyInfo())
  renderApp('/broadcasts/new')

  await userEvent.upload(screen.getByLabelText('영상 파일'), videoFile())
  await screen.findByAltText('썸네일 미리보기')
  await userEvent.click(screen.getByLabelText('제목'))
  await userEvent.paste('가'.repeat(101))
  await userEvent.click(screen.getByRole('button', { name: '등록' }))

  expect(screen.getByLabelText('제목')).toHaveAccessibleDescription('제목은 100자 이하로 입력하세요')
})

it('mp4나 webm이 아닌 파일은 영상 입력란 옆에 이유를 보여 주고 읽지 않는다', async () => {
  renderApp('/broadcasts/new')
  const fake = new File(['이건 영상이 아닙니다'], 'fake.mp4', { type: 'video/mp4' })

  await userEvent.upload(screen.getByLabelText('영상 파일'), fake)

  expect(await screen.findByText('mp4 또는 webm 영상 파일만 올릴 수 있습니다')).toBeInTheDocument()
  expect(screen.getByLabelText('영상 파일')).toHaveAccessibleDescription(
    expect.stringContaining('mp4 또는 webm 영상 파일만 올릴 수 있습니다'),
  )
  expect(mockedExtract).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
})

it('서버가 알려 준 크기 상한을 안내 문구에 보여 준다', async () => {
  renderApp('/broadcasts/new')

  expect(await screen.findByText('mp4 또는 webm 파일을 고르세요. (최대 10MB)')).toBeInTheDocument()
})

it('서버가 알려 준 크기 상한을 넘는 파일은 상한과 함께 거절한다', async () => {
  renderApp('/broadcasts/new')
  await screen.findByText('mp4 또는 webm 파일을 고르세요. (최대 10MB)')
  const big = videoFile()
  Object.defineProperty(big, 'size', { value: 10 * MB + 1 })

  await userEvent.upload(screen.getByLabelText('영상 파일'), big)

  expect(await screen.findByText('영상은 10MB 이하만 올릴 수 있습니다')).toBeInTheDocument()
  expect(mockedExtract).not.toHaveBeenCalled()
})

it('업로드 정책을 받지 못하면 화면에서 크기를 검사하지 않고 서버에 맡긴다', async () => {
  server.use(http.get('/api/broadcasts/upload-policy', () => new HttpResponse(null, { status: 500 })))
  mockedExtract.mockResolvedValue(readyInfo())
  renderApp('/broadcasts/new')
  const big = videoFile()
  Object.defineProperty(big, 'size', { value: 500 * MB })

  await userEvent.upload(screen.getByLabelText('영상 파일'), big)

  expect(await screen.findByAltText('썸네일 미리보기')).toBeInTheDocument()
  expect(screen.queryByText(/이하만 올릴 수 있습니다/)).not.toBeInTheDocument()
})

it('서버가 돌려준 필드 오류를 해당 입력란에 보여 주고 제목과 파일을 유지한다', async () => {
  mockedExtract.mockResolvedValue(readyInfo())
  server.use(
    http.post('/api/broadcasts', () =>
      HttpResponse.json(
        {
          type: 'about:blank',
          title: '잘못된 입력',
          status: 400,
          errors: [
            { field: 'title', reason: '서버가 말하는 제목 오류' },
            { field: 'video', reason: '서버가 말하는 영상 오류' },
          ],
        },
        { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
      ),
    ),
  )
  renderApp('/broadcasts/new')

  await userEvent.type(screen.getByLabelText('제목'), '유지될 제목')
  await userEvent.upload(screen.getByLabelText('영상 파일'), videoFile())
  await screen.findByAltText('썸네일 미리보기')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))

  await waitFor(() =>
    expect(screen.getByLabelText('제목')).toHaveAccessibleDescription('서버가 말하는 제목 오류'),
  )
  expect(screen.getByLabelText('영상 파일')).toHaveAccessibleDescription(
    expect.stringContaining('서버가 말하는 영상 오류'),
  )
  expect(screen.getByLabelText('제목')).toHaveValue('유지될 제목')
  expect(screen.getByAltText('썸네일 미리보기')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '등록' })).toBeEnabled()
})

it('서버가 413으로 거절하면 상한 값을 영상 입력란 옆에 보여 준다', async () => {
  mockedExtract.mockResolvedValue(readyInfo())
  server.use(
    http.post('/api/broadcasts', () =>
      HttpResponse.json(
        { title: '업로드 크기 초과', status: 413, maxBytes: 10 * 1024 * 1024 },
        { status: 413, headers: { 'Content-Type': 'application/problem+json' } },
      ),
    ),
  )
  renderApp('/broadcasts/new')

  await userEvent.type(screen.getByLabelText('제목'), '큰 영상')
  await userEvent.upload(screen.getByLabelText('영상 파일'), videoFile())
  await screen.findByAltText('썸네일 미리보기')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))

  expect(await screen.findByText('영상은 10MB 이하만 올릴 수 있습니다')).toBeInTheDocument()
  expect(screen.getByLabelText('제목')).toHaveValue('큰 영상')
})

it('정책보다 먼저 고른 큰 파일은 정책을 받은 뒤 크기 오류로 바뀐다', async () => {
  let openPolicy: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    openPolicy = resolve
  })
  server.use(
    http.get('/api/broadcasts/upload-policy', async () => {
      await gate
      return HttpResponse.json({ maxVideoBytes: 10 * MB, maxThumbnailBytes: 2 * MB, maxTitleLength: 100 })
    }),
  )
  mockedExtract.mockResolvedValue(readyInfo())
  renderApp('/broadcasts/new')
  const big = videoFile()
  Object.defineProperty(big, 'size', { value: 500 * MB })

  await userEvent.upload(screen.getByLabelText('영상 파일'), big)
  // 정책이 없을 때는 크기를 검사하지 못하므로 일단 읽힌다.
  expect(await screen.findByAltText('썸네일 미리보기')).toBeInTheDocument()

  openPolicy()

  expect(await screen.findByText('영상은 10MB 이하만 올릴 수 있습니다')).toBeInTheDocument()
  expect(screen.queryByAltText('썸네일 미리보기')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
})

it('첫 파일을 읽는 중에 두 번째 파일을 고르면 두 번째 파일의 결과만 남는다', async () => {
  let finishFirst: (info: ReturnType<typeof readyInfo>) => void = () => {}
  mockedExtract.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishFirst = resolve
      }),
  )
  mockedExtract.mockResolvedValueOnce({ ...readyInfo(), durationSeconds: 61, previewUrl: 'blob:second' })
  renderApp('/broadcasts/new')
  const input = screen.getByLabelText('영상 파일')

  await userEvent.upload(input, videoFile())
  await waitFor(() => expect(mockedExtract).toHaveBeenCalledTimes(1))
  await userEvent.upload(input, new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], '둘째.mp4', { type: 'video/mp4' }))
  expect(await screen.findByAltText('썸네일 미리보기')).toHaveAttribute('src', 'blob:second')

  // 늦게 끝난 첫 읽기는 화면을 바꾸지 못하고 자기 미리보기를 돌려준다.
  finishFirst({ ...readyInfo(), durationSeconds: 5, previewUrl: 'blob:first' })
  await waitFor(() => expect(vi.mocked(releasePreview)).toHaveBeenCalledWith('blob:first'))
  expect(screen.getByAltText('썸네일 미리보기')).toHaveAttribute('src', 'blob:second')
  expect(screen.getByText('재생 시간 01:01')).toBeInTheDocument()
})
