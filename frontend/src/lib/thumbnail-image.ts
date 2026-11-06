// 사용자가 고른 이미지를 JPEG 썸네일로 바꾼다. React와 무관하고, 이미지 열기와 JPEG 인코딩은 바깥에서 받는다(deps).
// 실제로는 브라우저 API(thumbnail-image-browser.ts)를, 테스트에서는 가짜를 넣는다.

/** 서버 정책의 상한과 별개로, 화면에서 쓸 썸네일의 가로 한도다. */
export const MAX_THUMBNAIL_WIDTH = 1280

// 서버 상한을 넘으면 화질을 한 단계씩 낮춰 다시 인코딩한다.
const QUALITY_STEPS = [0.85, 0.7, 0.5]

export const THUMBNAIL_UNUSABLE_MESSAGE =
  '이 파일은 썸네일로 쓸 수 없습니다. 다른 이미지를 고르거나 썸네일 없이 시작하세요.'

/** 브라우저가 연 이미지. source는 인코더만 알아보는 값이다. */
export interface DecodedImage {
  width: number
  height: number
  source: unknown
  release(): void
}

export interface ThumbnailImageDeps {
  /** 이미지를 연다. 열 수 없는 파일이면 거절한다. */
  decode(file: Blob): Promise<DecodedImage>
  /** 이미지를 width x height 캔버스에 그려 JPEG로 인코딩한다. 인코딩하지 못하면 null이다. */
  encodeJpeg(image: DecodedImage, width: number, height: number, quality: number): Promise<Blob | null>
}

export class ThumbnailUnusableError extends Error {
  constructor() {
    super(THUMBNAIL_UNUSABLE_MESSAGE)
    this.name = 'ThumbnailUnusableError'
  }
}

/** 가로가 maxWidth를 넘으면 비율을 지켜 줄이고, 작은 이미지는 키우지 않는다. */
export function fitWithin(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (width <= maxWidth) return { width, height }
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) }
}

/**
 * 파일을 JPEG로 바꾸고 가로 MAX_THUMBNAIL_WIDTH 이하로 줄인다.
 * maxBytes(서버 상한)를 넘으면 화질을 낮춰 다시 시도하고, 그래도 넘거나 열 수 없는 파일이면 ThumbnailUnusableError다.
 * maxBytes를 모르면(null) 크기는 서버에 맡긴다.
 */
export async function toJpegThumbnail(
  file: Blob,
  deps: ThumbnailImageDeps,
  maxBytes: number | null,
): Promise<Blob> {
  let image: DecodedImage
  try {
    image = await deps.decode(file)
  } catch {
    throw new ThumbnailUnusableError()
  }
  try {
    if (!(image.width > 0 && image.height > 0)) throw new ThumbnailUnusableError()
    const { width, height } = fitWithin(image.width, image.height, MAX_THUMBNAIL_WIDTH)
    for (const quality of QUALITY_STEPS) {
      const jpeg = await deps.encodeJpeg(image, width, height, quality).catch(() => null)
      if (jpeg === null || jpeg.type !== 'image/jpeg') throw new ThumbnailUnusableError()
      if (maxBytes === null || jpeg.size <= maxBytes) return jpeg
    }
    throw new ThumbnailUnusableError()
  } finally {
    image.release()
  }
}
