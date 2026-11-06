import { describe, expect, it } from 'vitest'
import { createBroadcastInput } from './broadcast-input'
import { ThumbnailUnusableError, type ThumbnailImageDeps } from './thumbnail-image'

const policy = { maxTitleLength: 100, maxThumbnailBytes: 100 }

// 화질마다 인코딩 결과 크기를 정하는 가짜. 시도한 화질도 기록한다.
function imagesEncodingTo(sizeByQuality: (quality: number) => number) {
  const qualities: number[] = []
  const deps: ThumbnailImageDeps = {
    decode: async () => ({ width: 1920, height: 1080, source: null, release: () => {} }),
    encodeJpeg: async (_image, _width, _height, quality) => {
      qualities.push(quality)
      return new Blob([new Uint8Array(sizeByQuality(quality))], { type: 'image/jpeg' })
    },
  }
  return { deps, qualities }
}

const picture = new Blob(['synthetic'], { type: 'image/png' })

describe('제목 검사', () => {
  const { deps } = imagesEncodingTo(() => 1)

  it('정책의 상한을 넘으면 이유를 돌려주고, 상한 이하면 통과한다', () => {
    const input = createBroadcastInput(policy, deps)

    expect(input.checkTitle('가'.repeat(100))).toBeNull()
    expect(input.checkTitle('가'.repeat(101))).toBe('제목은 100자 이하로 입력하세요')
    expect(input.checkTitle('  ')).toBe('제목을 입력하세요')
  })

  it('정책을 모르면 길이는 서버에 맡긴다', () => {
    const input = createBroadcastInput(null, deps)

    expect(input.checkTitle('가'.repeat(1000))).toBeNull()
    expect(input.checkTitle('')).toBe('제목을 입력하세요')
  })
})

describe('썸네일 변환', () => {
  it('상한 안이면 첫 화질로 끝낸다', async () => {
    const { deps, qualities } = imagesEncodingTo(() => 50)

    const jpeg = await createBroadcastInput(policy, deps).convertThumbnail(picture)

    expect(jpeg.type).toBe('image/jpeg')
    expect(qualities).toEqual([0.85])
  })

  it('상한을 넘으면 화질을 0.85, 0.7, 0.5 순으로 낮춘다', async () => {
    const { deps, qualities } = imagesEncodingTo((quality) => (quality > 0.6 ? 500 : 50))

    await createBroadcastInput(policy, deps).convertThumbnail(picture)

    expect(qualities).toEqual([0.85, 0.7, 0.5])
  })

  it('그래도 넘으면 사용자가 고른 이미지는 쓸 수 없다고 거절한다', async () => {
    const { deps } = imagesEncodingTo(() => 500)

    await expect(createBroadcastInput(policy, deps).convertThumbnail(picture)).rejects.toBeInstanceOf(
      ThumbnailUnusableError,
    )
  })

  it('영상에서 뽑은 프레임은 같은 변환을 거치고, 그래도 넘으면 썸네일 없이(null) 진행한다', async () => {
    const fits = imagesEncodingTo((quality) => (quality > 0.6 ? 500 : 50))
    const tooBig = imagesEncodingTo(() => 500)

    await expect(createBroadcastInput(policy, fits.deps).prepareThumbnail(picture)).resolves.toBeInstanceOf(Blob)
    expect(fits.qualities).toEqual([0.85, 0.7, 0.5])
    await expect(createBroadcastInput(policy, tooBig.deps).prepareThumbnail(picture)).resolves.toBeNull()
    await expect(createBroadcastInput(policy, tooBig.deps).prepareThumbnail(null)).resolves.toBeNull()
  })

  it('정책을 모르면 크기는 서버에 맡기고 한 번만 인코딩한다', async () => {
    const { deps, qualities } = imagesEncodingTo(() => 5_000_000)

    await createBroadcastInput(null, deps).convertThumbnail(picture)

    expect(qualities).toEqual([0.85])
  })
})

describe('서버 오류 배치', () => {
  const input = createBroadcastInput(policy, imagesEncodingTo(() => 1).deps)

  it('필드 오류는 제목·영상 옆과 입력란 없는 필드 목록으로 나눈다', () => {
    expect(
      input.placeFailure({
        kind: 'invalid',
        fieldErrors: { title: '제목 오류', video: '영상 오류', thumbnail: '썸네일 오류', durationSeconds: '시간 오류' },
      }),
    ).toEqual({
      title: '제목 오류',
      video: '영상 오류',
      thumbnail: '썸네일 오류',
      others: ['시간 오류'],
      unknown: false,
    })
  })

  it('413은 영상 옆에 상한 안내를 보여 준다', () => {
    expect(input.placeFailure({ kind: 'tooLarge', maxBytes: 10, message: '너무 큽니다' })).toEqual({
      title: null,
      video: '너무 큽니다',
      thumbnail: null,
      others: [],
      unknown: false,
    })
  })

  it('영상이 없는 요청의 413은 썸네일 옆에 보여 준다', () => {
    expect(
      input.placeFailure({ kind: 'tooLarge', maxBytes: 10, message: '썸네일은 2MB 이하만 올릴 수 있습니다' }, 'thumbnail'),
    ).toEqual({
      title: null,
      video: null,
      thumbnail: '썸네일은 2MB 이하만 올릴 수 있습니다',
      others: [],
      unknown: false,
    })
  })

  it('알 수 없는 실패는 unknown으로 알린다', () => {
    expect(input.placeFailure({ kind: 'unknown' })).toMatchObject({ unknown: true, title: null, others: [] })
  })
})
