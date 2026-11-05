import { useEffect, useState } from 'react'
import { extractVideoMetadata, releasePreview, type VideoMetadata } from '../lib/video-metadata'
import { sizeLimitMessage, validateVideoFile } from '../lib/upload-rules'

/** 고른 영상의 상태: 안 고름, 읽는 중, 읽음, 이 브라우저에서 열 수 없음, 화면 검사에서 거절 */
export type VideoSelection =
  | { status: 'empty' }
  | { status: 'reading' }
  | { status: 'ready'; metadata: VideoMetadata }
  | { status: 'unreadable' }
  | { status: 'invalid'; reason: string }

type ReadResult = Exclude<VideoSelection, { status: 'empty' | 'reading' }>

/**
 * 영상 고르기 → 검사 → 메타데이터 추출 → 미리보기 주소 관리를 한곳에서 맡는다.
 * 크기는 "지금" 받아 둔 서버 정책(maxVideoBytes)으로 검사하므로, 정책이 파일보다 늦게 와도
 * 고른 파일을 다시 검사한다. maxVideoBytes가 null이면 크기 검사는 서버에 맡긴다.
 */
export function useVideoSelection(maxVideoBytes: number | null) {
  const [file, setFile] = useState<File | null>(null)
  // 읽기 결과는 어느 파일의 것인지 함께 둔다. 파일을 바꾸면 이전 결과는 자연히 무시된다.
  const [result, setResult] = useState<{ file: File; value: ReadResult } | null>(null)

  const tooBigLimit =
    file !== null && maxVideoBytes !== null && file.size > maxVideoBytes ? maxVideoBytes : null
  const tooBig = tooBigLimit !== null

  useEffect(() => {
    // 크기 초과는 아래에서 바로 거절로 계산하므로 읽지 않는다.
    if (!file || tooBig) return
    let cancelled = false
    let previewUrl: string | null = null
    void (async () => {
      // 크기는 위에서 검사했으므로 여기서는 형식(시그니처)만 본다.
      const problem = await validateVideoFile(file, null)
      if (cancelled) return
      if (problem) {
        setResult({ file, value: { status: 'invalid', reason: problem } })
        return
      }
      try {
        const metadata = await extractVideoMetadata(file)
        if (cancelled) {
          // 이미 다른 파일로 바뀌었으면 늦게 끝난 읽기의 미리보기는 바로 돌려준다.
          releasePreview(metadata.previewUrl)
          return
        }
        previewUrl = metadata.previewUrl
        setResult({ file, value: { status: 'ready', metadata } })
      } catch {
        if (!cancelled) setResult({ file, value: { status: 'unreadable' } })
      }
    })()
    return () => {
      cancelled = true
      releasePreview(previewUrl)
    }
  }, [file, tooBig])

  let selection: VideoSelection
  if (!file) selection = { status: 'empty' }
  else if (tooBigLimit !== null) {
    selection = { status: 'invalid', reason: sizeLimitMessage(tooBigLimit) }
  }
  else if (result?.file === file) selection = result.value
  else selection = { status: 'reading' }

  return { file, selection, select: setFile }
}
