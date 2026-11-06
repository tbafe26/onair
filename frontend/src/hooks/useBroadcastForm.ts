import { useCallback, useState } from 'react'
import type { ApiFailure } from '../api/broadcasts'
import type { BroadcastInput, TooLargeField } from '../lib/broadcast-input'
import { useThumbnailPicker } from './useThumbnailPicker'

interface FormErrors {
  title: string | null
  video: string | null
  thumbnail: string | null
  others: string[]
  unknown: boolean
}

const NO_ERRORS: FormErrors = { title: null, video: null, thumbnail: null, others: [], unknown: false }

/**
 * 방송 입력 폼. 제목, 썸네일 선택, 화면 검사, 서버 오류 배치, 고친 칸의 오류 지우기를 한곳에서 맡는다.
 * 녹화방송 등록과 라이브 송출이 같이 쓴다. 영상 선택은 등록 화면만 있으므로 여기에 없다.
 */
export function useBroadcastForm(input: BroadcastInput) {
  const [title, setTitle] = useState('')
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  const picker = useThumbnailPicker(input.convertThumbnail)

  const thumbnail = {
    selection: picker.selection,
    select: async (file: File) => {
      setErrors((current) => ({ ...current, thumbnail: null }))
      await picker.select(file)
    },
    clear: () => {
      setErrors((current) => ({ ...current, thumbnail: null }))
      picker.clear()
    },
  }

  const showFailure = useCallback(
    (failure: ApiFailure, tooLargeField?: TooLargeField) => setErrors(input.placeFailure(failure, tooLargeField)),
    [input],
  )

  return {
    title,
    changeTitle(value: string) {
      setTitle(value)
      setErrors((current) => ({ ...current, title: null }))
    },
    thumbnail,
    titleError: errors.title,
    videoError: errors.video,
    thumbnailError: errors.thumbnail,
    /** 입력란이 없는 필드(재생 시간)의 서버 오류 */
    otherErrors: errors.others,
    /** 어느 필드의 오류도 아닌 알 수 없는 실패 */
    unknown: errors.unknown,
    /** 제목을 화면에서 검사한다. 통과하면 true, 아니면 이유를 남기고 false. */
    checkTitle(): boolean {
      const problem = input.checkTitle(title)
      setErrors((current) => ({ ...current, title: problem }))
      return problem === null
    },
    /** 화면에서 직접 알리는 영상 칸의 메시지(예: 파일을 고르지 않음). 지우려면 null. */
    setVideoError(message: string | null) {
      setErrors((current) => ({ ...current, video: message }))
    },
    /** 서버가 거절한 이유를 해당 칸 옆에 놓는다. 앞서 보여 준 서버 오류는 바뀐다. */
    showFailure,
    /** 서버가 알려 준 오류를 모두 지운다(다시 시도하기 전). */
    clearFailure() {
      setErrors(NO_ERRORS)
    },
  }
}
