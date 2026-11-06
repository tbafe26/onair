import { describe, expect, it, vi } from 'vitest'
import {
  fitWithin,
  MAX_THUMBNAIL_WIDTH,
  THUMBNAIL_UNUSABLE_MESSAGE,
  toJpegThumbnail,
  ThumbnailUnusableError,
  type DecodedImage,
  type ThumbnailImageDeps,
} from './thumbnail-image'

function fakeDeps(options: {
  width?: number
  height?: number
  sizeByQuality?: (quality: number) => number
  type?: string
  decodeFails?: boolean
}) {
  const release = vi.fn()
  const encoded: { width: number; height: number; quality: number }[] = []
  const deps: ThumbnailImageDeps = {
    decode: async () => {
      if (options.decodeFails) throw new Error('열 수 없음')
      const image: DecodedImage = {
        width: options.width ?? 4000,
        height: options.height ?? 3000,
        source: null,
        release,
      }
      return image
    },
    encodeJpeg: async (_image, width, height, quality) => {
      encoded.push({ width, height, quality })
      const size = options.sizeByQuality?.(quality) ?? 1000
      return new Blob([new Uint8Array(size)], { type: options.type ?? 'image/jpeg' })
    },
  }
  return { deps, release, encoded }
}

const file = new Blob(['x'], { type: 'image/png' })

describe('fitWithin', () => {
  it('가로가 한도를 넘으면 비율을 지켜 줄인다', () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 })
    expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 1280, height: 1707 })
  })

  it('한도 이하의 이미지는 키우지 않는다', () => {
    expect(fitWithin(640, 360, 1280)).toEqual({ width: 640, height: 360 })
    expect(fitWithin(1280, 720, 1280)).toEqual({ width: 1280, height: 720 })
  })

  it('아주 납작한 이미지도 높이가 1px 아래로 내려가지 않는다', () => {
    expect(fitWithin(12800, 1, 1280).height).toBe(1)
  })
})

describe('toJpegThumbnail', () => {
  it('큰 이미지는 가로 1280px로 줄여 JPEG로 돌려주고 이미지를 해제한다', async () => {
    const { deps, release, encoded } = fakeDeps({ width: 4000, height: 3000 })

    const result = await toJpegThumbnail(file, deps, 2 * 1024 * 1024)

    expect(result.type).toBe('image/jpeg')
    expect(encoded).toHaveLength(1)
    expect(encoded[0]).toMatchObject({ width: MAX_THUMBNAIL_WIDTH, height: 960 })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('작은 이미지는 원래 크기로 그린다', async () => {
    const { deps, encoded } = fakeDeps({ width: 800, height: 600 })

    await toJpegThumbnail(file, deps, null)

    expect(encoded[0]).toMatchObject({ width: 800, height: 600 })
  })

  it('서버 상한을 넘으면 화질을 낮춰 상한 안에 들어오는 결과를 돌려준다', async () => {
    const { deps, encoded } = fakeDeps({ sizeByQuality: (quality) => (quality > 0.8 ? 3000 : 900) })

    const result = await toJpegThumbnail(file, deps, 1000)

    expect(result.size).toBe(900)
    expect(encoded.map((attempt) => attempt.quality)).toEqual([0.85, 0.7])
  })

  it('가장 낮은 화질로도 상한을 넘으면 쓸 수 없는 파일이다', async () => {
    const { deps, release } = fakeDeps({ sizeByQuality: () => 5000 })

    await expect(toJpegThumbnail(file, deps, 1000)).rejects.toThrow(ThumbnailUnusableError)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('브라우저가 열지 못하는 파일은 쓸 수 없다는 안내 문구로 거절한다', async () => {
    const { deps } = fakeDeps({ decodeFails: true })

    await expect(toJpegThumbnail(file, deps, null)).rejects.toThrow(THUMBNAIL_UNUSABLE_MESSAGE)
  })

  it('JPEG로 인코딩하지 못하는 브라우저는 쓸 수 없는 파일로 본다', async () => {
    const { deps } = fakeDeps({ type: 'image/png' })

    await expect(toJpegThumbnail(file, deps, null)).rejects.toThrow(ThumbnailUnusableError)
  })

  it('크기를 알 수 없는 이미지는 쓸 수 없다', async () => {
    const { deps, release } = fakeDeps({ width: 0, height: 0 })

    await expect(toJpegThumbnail(file, deps, null)).rejects.toThrow(ThumbnailUnusableError)
    expect(release).toHaveBeenCalledTimes(1)
  })
})
