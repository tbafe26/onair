import type { ThumbnailImageDeps } from './thumbnail-image'

/** 실제 브라우저의 이미지 디코더와 캔버스를 썸네일 변환에 연결한다. */
export const browserImageDeps: ThumbnailImageDeps = {
  async decode(file) {
    const bitmap = await createImageBitmap(file)
    return { width: bitmap.width, height: bitmap.height, source: bitmap, release: () => bitmap.close() }
  },
  encodeJpeg(image, width, height, quality) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return Promise.resolve(null)
    // JPEG는 투명을 못 쓰므로 PNG·WebP의 투명한 부분이 검게 되지 않게 흰 바탕을 깐다.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image.source as ImageBitmap, 0, 0, width, height)
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  },
}
