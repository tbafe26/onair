import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createBroadcastInput } from '../lib/broadcast-input'
import type { ThumbnailImageDeps } from '../lib/thumbnail-image'
import { useBroadcastForm } from './useBroadcastForm'

const policy = { maxTitleLength: 10, maxThumbnailBytes: 100 }
const images: ThumbnailImageDeps = {
  decode: async () => ({ width: 10, height: 10, source: null, release: () => {} }),
  encodeJpeg: async () => new Blob([new Uint8Array(5)], { type: 'image/jpeg' }),
}
const input = createBroadcastInput(policy, images)

function setup() {
  return renderHook(() => useBroadcastForm(input))
}

describe('화면 검사', () => {
  it('제목이 틀리면 이유를 남기고 통과하지 못하며, 고치면 이유가 사라진다', () => {
    const { result } = setup()

    let ok = true
    act(() => {
      ok = result.current.checkTitle()
    })
    expect(ok).toBe(false)
    expect(result.current.titleError).toBe('제목을 입력하세요')

    act(() => result.current.changeTitle('방송'))
    expect(result.current.titleError).toBeNull()
    act(() => {
      ok = result.current.checkTitle()
    })
    expect(ok).toBe(true)
  })
})

describe('서버 오류 배치', () => {
  it('필드 오류를 제목·썸네일·그 밖의 자리에 나눠 담는다', () => {
    const { result } = setup()

    act(() =>
      result.current.showFailure({
        kind: 'invalid',
        fieldErrors: { title: '제목 오류', thumbnail: '썸네일 오류', durationSeconds: '시간 오류' },
      }),
    )

    expect(result.current).toMatchObject({
      titleError: '제목 오류',
      thumbnailError: '썸네일 오류',
      otherErrors: ['시간 오류'],
      unknown: false,
    })
  })

  it('413은 요청이 가리킨 칸에 보인다', () => {
    const { result } = setup()
    const tooLarge = { kind: 'tooLarge', maxBytes: 1, message: '너무 큽니다' } as const

    act(() => result.current.showFailure(tooLarge, 'thumbnail'))
    expect(result.current).toMatchObject({ thumbnailError: '너무 큽니다', videoError: null })

    act(() => result.current.showFailure(tooLarge))
    expect(result.current).toMatchObject({ thumbnailError: null, videoError: '너무 큽니다' })
  })

  it('알 수 없는 실패는 unknown이고 칸에는 아무것도 붙이지 않는다', () => {
    const { result } = setup()

    act(() => result.current.showFailure({ kind: 'unknown' }))

    expect(result.current).toMatchObject({ unknown: true, titleError: null, thumbnailError: null })
  })

  it('다시 보여 주면 앞의 오류는 바뀐다', () => {
    const { result } = setup()
    act(() => result.current.showFailure({ kind: 'invalid', fieldErrors: { title: '제목 오류' } }))

    act(() => result.current.showFailure({ kind: 'invalid', fieldErrors: { thumbnail: '썸네일 오류' } }))

    expect(result.current).toMatchObject({ titleError: null, thumbnailError: '썸네일 오류' })
  })
})

describe('고친 칸의 오류 지우기', () => {
  it('제목을 고치면 제목 오류만 지운다', () => {
    const { result } = setup()
    act(() =>
      result.current.showFailure({ kind: 'invalid', fieldErrors: { title: '제목 오류', thumbnail: '썸네일 오류' } }),
    )

    act(() => result.current.changeTitle('새 제목'))

    expect(result.current).toMatchObject({ titleError: null, thumbnailError: '썸네일 오류' })
  })

  it('썸네일을 고르거나 취소하면 썸네일 오류만 지운다', async () => {
    const { result } = setup()
    const showBoth = () =>
      result.current.showFailure({ kind: 'invalid', fieldErrors: { title: '제목 오류', thumbnail: '썸네일 오류' } })

    act(showBoth)
    await act(() => result.current.thumbnail.select(new File(['x'], 'a.png')))
    expect(result.current).toMatchObject({ titleError: '제목 오류', thumbnailError: null })
    expect(result.current.thumbnail.selection.status).toBe('ready')

    act(showBoth)
    act(() => result.current.thumbnail.clear())
    expect(result.current).toMatchObject({ titleError: '제목 오류', thumbnailError: null })
  })

  it('clearFailure는 서버가 알려 준 오류를 모두 지운다', () => {
    const { result } = setup()
    act(() => result.current.showFailure({ kind: 'unknown' }))

    act(() => result.current.clearFailure())

    expect(result.current.unknown).toBe(false)
  })
})
