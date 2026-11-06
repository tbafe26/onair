import { useCallback, useEffect, useRef, useState } from 'react'
import { toJpegThumbnail, type ThumbnailImageDeps } from '../lib/thumbnail-image'

export type ThumbnailSelection =
  | { status: 'none' }
  | { status: 'converting' }
  | { status: 'ready'; blob: Blob; previewUrl: string }
  /** 브라우저가 열지 못했거나 서버 상한 안으로 줄이지 못한 파일. message를 보여 준다. */
  | { status: 'unusable'; message: string }

/** 썸네일 선택 상태. 고른 파일을 JPEG로 바꾸고, 미리보기 주소는 쓰지 않게 되면 해제한다. */
export function useThumbnailPicker(deps: ThumbnailImageDeps, maxBytes: number | null) {
  const [selection, setSelection] = useState<ThumbnailSelection>({ status: 'none' })
  // 변환이 끝나기 전에 다른 파일을 고르거나 취소하면 늦게 끝난 결과를 버린다.
  const latest = useRef(0)

  const previewUrl = selection.status === 'ready' ? selection.previewUrl : null
  useEffect(() => {
    if (previewUrl === null) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(
    () => () => {
      latest.current += 1
    },
    [],
  )

  const select = useCallback(
    async (file: File) => {
      const mine = ++latest.current
      setSelection({ status: 'converting' })
      try {
        const blob = await toJpegThumbnail(file, deps, maxBytes)
        if (mine !== latest.current) return
        setSelection({ status: 'ready', blob, previewUrl: URL.createObjectURL(blob) })
      } catch (error) {
        if (mine !== latest.current) return
        setSelection({
          status: 'unusable',
          message: error instanceof Error ? error.message : '썸네일을 만들지 못했습니다.',
        })
      }
    },
    [deps, maxBytes],
  )

  const clear = useCallback(() => {
    latest.current += 1
    setSelection({ status: 'none' })
  }, [])

  return { selection, select, clear }
}
