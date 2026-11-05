import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Film } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { broadcastKeys } from '../api/broadcast-keys'
import { decodeFailure, fetchUploadPolicy, registerBroadcast } from '../api/broadcasts'
import { Button } from '../components/ui/button'
import { useVideoSelection } from '../hooks/useVideoSelection'
import { formatDuration } from '../lib/format'
import { formatLimit, thumbnailWithinLimit, validateTitle } from '../lib/upload-rules'

const inputClass =
  'h-11 w-full rounded-xl border border-border bg-background px-4 text-foreground outline-none placeholder:text-sub focus-visible:ring-2 focus-visible:ring-ring'

// 화면이 서버와 같은 규칙으로 먼저 검사하고, 서버가 돌려준 필드 오류도 해당 입력란 옆에 보여 준다.
// 실패해도 제목과 고른 파일은 그대로 둔다.
export function BroadcastCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  // 서버가 필드 오류로 알려 주지 않은 알 수 없는 실패
  const [unknownFailure, setUnknownFailure] = useState(false)
  // 입력란 옆에 보여 줄 메시지. 영상 메시지는 등록 시 누락 안내나 서버 응답이다.
  // 고르는 즉시 검사한 결과(거절 이유)는 selection에서 온다.
  const [titleError, setTitleError] = useState<string | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  // 입력란이 없는 필드(썸네일, 재생 시간)의 서버 오류
  const [otherErrors, setOtherErrors] = useState<string[]>([])
  // 서버의 업로드 정책. 받아 오기 전이나 실패했을 때는 길이·크기를 화면에서 검사하지 않고 서버에 맡긴다.
  const { data: uploadPolicy } = useQuery({
    queryKey: broadcastKeys.uploadPolicy(),
    queryFn: fetchUploadPolicy,
    retry: false,
  })
  const maxVideoBytes = uploadPolicy?.maxVideoBytes ?? null
  const { file, selection, select } = useVideoSelection(maxVideoBytes)
  const videoMessage = videoError ?? (selection.status === 'invalid' ? selection.reason : null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setUnknownFailure(false)
    setVideoError(null)
    setOtherErrors([])
    select(event.target.files?.[0] ?? null)
  }

  const uploading = progress !== null
  // 제목과 파일 누락은 눌렀을 때 메시지로 알리므로 버튼은 막지 않는다.
  const canSubmit =
    !uploading &&
    selection.status !== 'reading' &&
    selection.status !== 'unreadable' &&
    selection.status !== 'invalid'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    const titleProblem = validateTitle(title, uploadPolicy?.maxTitleLength ?? null)
    setTitleError(titleProblem)
    if (!file) setVideoError('영상 파일을 선택하세요')
    if (titleProblem || !file || selection.status !== 'ready') return
    setUnknownFailure(false)
    setOtherErrors([])
    setProgress(0)
    try {
      const created = await registerBroadcast(
        {
          title,
          video: file,
          thumbnail: thumbnailWithinLimit(
            selection.metadata.thumbnail,
            uploadPolicy?.maxThumbnailBytes ?? null,
          ),
          durationSeconds: selection.metadata.durationSeconds,
        },
        setProgress,
      )
      await queryClient.invalidateQueries({ queryKey: broadcastKeys.all })
      navigate(`/broadcasts/${created.id}`)
    } catch (error) {
      // 입력한 제목과 고른 파일은 그대로 두어 다시 시도할 수 있게 한다.
      const failure = decodeFailure(error)
      const fieldErrors: Record<string, string> = failure.kind === 'invalid' ? failure.fieldErrors : {}
      setTitleError(fieldErrors.title ?? null)
      setVideoError(failure.kind === 'tooLarge' ? failure.message : (fieldErrors.video ?? null))
      setOtherErrors(
        [fieldErrors.thumbnail, fieldErrors.durationSeconds].filter((m) => m !== undefined),
      )
      setUnknownFailure(failure.kind !== 'invalid' && failure.kind !== 'tooLarge')
      setProgress(null)
    }
  }

  return (
    <section className="max-w-2xl">
      <h1 className="text-[28px] font-extrabold text-foreground">방송 등록</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6 rounded-2xl bg-card p-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="broadcast-title" className="font-semibold text-title">
            제목
          </label>
          <input
            id="broadcast-title"
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              setTitleError(null)
            }}
            placeholder="방송 제목을 입력하세요"
            disabled={uploading}
            aria-invalid={titleError !== null}
            aria-describedby={titleError ? 'broadcast-title-error' : undefined}
            className={inputClass}
          />
          {titleError && (
            <p id="broadcast-title-error" className="text-sm text-destructive">
              {titleError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="broadcast-video" className="font-semibold text-title">
            영상 파일
          </label>
          <input
            id="broadcast-video"
            type="file"
            accept="video/mp4,video/webm"
            onChange={handleFileChange}
            disabled={uploading}
            aria-invalid={videoMessage !== null}
            aria-describedby={
              videoMessage ? 'broadcast-video-error broadcast-video-hint' : 'broadcast-video-hint'
            }
            className="block w-full cursor-pointer rounded-xl border border-border bg-background text-sub file:mr-4 file:h-11 file:cursor-pointer file:border-0 file:bg-card file:px-4 file:font-semibold file:text-foreground"
          />
          <p id="broadcast-video-hint" className="text-xs text-sub">
            mp4 또는 webm 파일을 고르세요.
            {maxVideoBytes !== null && ` (최대 ${formatLimit(maxVideoBytes)})`}
          </p>
          {videoMessage && (
            <p id="broadcast-video-error" className="text-sm text-destructive">
              {videoMessage}
            </p>
          )}
        </div>

        {selection.status === 'reading' && <p className="text-sub">영상을 읽는 중...</p>}
        {selection.status === 'unreadable' && (
          <p role="alert" className="text-destructive">
            이 브라우저에서 재생할 수 없는 영상입니다
          </p>
        )}
        {selection.status === 'ready' && (
          <div className="flex flex-col gap-2">
            <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-xl bg-background">
              {selection.metadata.previewUrl ? (
                <img
                  src={selection.metadata.previewUrl}
                  alt="썸네일 미리보기"
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-sub">
                  <Film className="size-10" aria-hidden="true" />
                </div>
              )}
            </div>
            <p className="text-sub">재생 시간 {formatDuration(selection.metadata.durationSeconds)}</p>
          </div>
        )}

        {uploading && (
          <div className="flex flex-col gap-2">
            <progress
              value={progress}
              max={100}
              aria-label="업로드 진행률"
              className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-background [&::-webkit-progress-value]:bg-primary"
            />
            <p className="text-sub">업로드 중 {progress}%</p>
          </div>
        )}
        {otherErrors.map((message) => (
          <p key={message} role="alert" className="text-destructive">
            {message}
          </p>
        ))}
        {unknownFailure && (
          <p role="alert" className="text-destructive">
            방송을 등록하지 못했습니다. 잠시 뒤 다시 시도해 주세요.
          </p>
        )}

        <Button type="submit" disabled={!canSubmit} className="h-11 self-start px-8">
          {uploading ? '등록 중...' : '등록'}
        </Button>
      </form>
    </section>
  )
}
