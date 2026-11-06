import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { broadcastKeys } from '../api/broadcast-keys'
import { ChatPanel } from '../components/ChatPanel'
import { DonationHistory } from '../components/DonationHistory'
import { Button } from '../components/ui/button'
import type { CameraFacing, CameraInfo, CameraUnavailableReason } from '../live/broadcaster'
import { useBroadcastInput } from '../hooks/useBroadcastInput'
import { useBroadcastForm } from '../hooks/useBroadcastForm'
import { START_FAILURE_MESSAGE } from '../live/signaling-protocol'
import { useLiveBroadcaster } from '../live/useLiveBroadcaster'
import { formatDuration } from '../lib/format'

const inputClass =
  'h-11 w-full rounded-xl border border-border bg-background px-4 text-foreground outline-none placeholder:text-sub focus-visible:ring-2 focus-visible:ring-ring'

const cameraMessages: Record<CameraUnavailableReason, { title: string; hint: string }> = {
  denied: {
    title: '카메라와 마이크 권한이 거부되었습니다',
    hint: '주소창의 사이트 설정에서 카메라와 마이크를 허용한 뒤 페이지를 새로고침하세요.',
  },
  notFound: {
    title: '카메라를 사용할 수 없습니다',
    hint: '카메라가 연결되어 있는지, 다른 앱이 카메라를 쓰고 있지 않은지 확인한 뒤 새로고침하세요.',
  },
  insecure: {
    title: '안전한 연결(HTTPS)이 아니라서 카메라를 켤 수 없습니다',
    hint: 'HTTPS 주소(https://...)로 접속해 주세요.',
  },
}

/** 카메라 미리보기와 송출 중 화면. MediaStream은 video 요소에 직접 연결한다. */
function CameraView({ stream, children }: { stream: MediaStream; children?: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])
  return (
    <div className="relative aspect-video overflow-hidden bg-black max-md:-mx-5 md:w-full md:rounded-xl">
      <video
        ref={videoRef}
        aria-label="카메라 미리보기"
        autoPlay
        muted
        playsInline
        className="size-full object-cover"
      />
      {children}
    </div>
  )
}

const facingLabels: Record<CameraFacing, string> = { user: '전면', environment: '후면' }

/** 미리보기 중에만 누를 수 있다. 카메라가 하나뿐이면 보이지 않는다. */
function CameraSwitch({ camera, disabled, onSwitch }: { camera: CameraInfo; disabled: boolean; onSwitch: () => void }) {
  if (!camera.canSwitch) return null
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full text-base"
        disabled={disabled || camera.switching}
        onClick={onSwitch}
      >
        카메라 전환
      </Button>
      <p className="text-sm text-sub">현재 {facingLabels[camera.facing]} 카메라</p>
      {camera.switchFailure && (
        <p role="alert" className="text-sm text-destructive">
          {camera.switchFailure}
        </p>
      )}
    </div>
  )
}

function subscribeToSecondTicks(onTick: () => void) {
  const timer = setInterval(onTick, 1000)
  return () => clearInterval(timer)
}

const currentSecond = () => Math.floor(Date.now() / 1000)

/** 송출 시작 시각부터 지난 시간. 1초마다 이 컴포넌트만 다시 그린다. */
function Elapsed({ startedAt }: { startedAt: number }) {
  const nowSecond = useSyncExternalStore(subscribeToSecondTicks, currentSecond)
  return <time>{formatDuration(Math.max(0, nowSecond - Math.floor(startedAt / 1000)))}</time>
}

export function LiveBroadcastPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { state, camera, start, end, switchCamera } = useLiveBroadcaster()
  const { input } = useBroadcastInput()
  const form = useBroadcastForm(input)
  const { thumbnail, showFailure } = form
  const thumbnailInputRef = useRef<HTMLInputElement>(null)
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  const [ending, setEnding] = useState(false)

  const onAir = state.phase === 'onAir'

  // 송출 시작이 실패하면 서버가 거절한 필드를 직접 검사한 결과와 같은 자리에 보여 준다.
  const startFailure = state.phase === 'previewing' ? state.startFailure : null
  useEffect(() => {
    // 영상이 없는 요청이라 413은 썸네일의 것이다.
    if (startFailure !== null && startFailure.kind !== 'message') showFailure(startFailure, 'thumbnail')
  }, [startFailure, showFailure])
  const thumbnailMessage = thumbnail.selection.status === 'unusable' ? thumbnail.selection.message : form.thumbnailError
  const failureMessage =
    startFailure?.kind === 'message' ? startFailure.message : form.unknown ? START_FAILURE_MESSAGE : null

  // 송출 중에 다른 화면으로 나가거나 탭을 닫으면 방송이 끝나므로 한 번 확인한다.
  const blocker = useBlocker(onAir)
  useEffect(() => {
    if (!onAir) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [onAir])

  // 방송이 끝나면 목록을 새로 받도록 하고 그 방송의 상세로 간다.
  const endedId = state.phase === 'ended' ? state.broadcastId : null
  useEffect(() => {
    if (endedId === null) return
    void queryClient.invalidateQueries({ queryKey: broadcastKeys.all })
    navigate(`/broadcasts/${endedId}`)
  }, [endedId, queryClient, navigate])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (state.phase !== 'previewing') return
    form.clearFailure()
    if (!form.checkTitle()) return
    void start({
      title: form.title,
      thumbnail: thumbnail.selection.status === 'ready' ? thumbnail.selection.blob : null,
    })
  }

  function handleThumbnailChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void thumbnail.select(file)
  }

  function handleThumbnailClear() {
    thumbnail.clear()
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = ''
  }

  async function handleEnd() {
    setConfirmingEnd(false)
    setEnding(true)
    await end()
    setEnding(false)
  }

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-[28px] font-extrabold text-foreground">라이브 송출</h1>

      {state.phase === 'requestingCamera' && (
        <p role="status" className="mt-6 text-sub">
          카메라와 마이크를 켜는 중입니다. 권한 요청이 나오면 허용해 주세요.
        </p>
      )}

      {state.phase === 'cameraUnavailable' && (
        <div role="alert" className="mt-6 flex flex-col gap-2 rounded-2xl bg-card p-6">
          <p className="font-semibold text-destructive">{cameraMessages[state.reason].title}</p>
          <p className="text-sub">{cameraMessages[state.reason].hint}</p>
        </div>
      )}

      {(state.phase === 'previewing' || state.phase === 'starting') && (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <CameraView stream={state.stream} />
          <CameraSwitch camera={camera} disabled={state.phase === 'starting'} onSwitch={() => void switchCamera()} />
          <div className="flex flex-col gap-2">
            <label htmlFor="live-title" className="font-semibold text-title">
              제목
            </label>
            <input
              id="live-title"
              type="text"
              value={form.title}
              onChange={(event) => form.changeTitle(event.target.value)}
              placeholder="방송 제목을 입력하세요"
              disabled={state.phase === 'starting'}
              aria-invalid={form.titleError !== null}
              aria-describedby={form.titleError ? 'live-title-error' : undefined}
              className={inputClass}
            />
            {form.titleError && (
              <p id="live-title-error" className="text-sm text-destructive">
                {form.titleError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="live-thumbnail" className="font-semibold text-title">
              썸네일 <span className="font-normal text-sub">(선택)</span>
            </label>
            <input
              ref={thumbnailInputRef}
              id="live-thumbnail"
              type="file"
              accept="image/*"
              onChange={handleThumbnailChange}
              disabled={state.phase === 'starting'}
              className="text-sub"
            />
            {thumbnail.selection.status === 'converting' && (
              <p role="status" className="text-sub">
                썸네일을 준비하는 중입니다.
              </p>
            )}
            {thumbnailMessage && (
              <p role="alert" className="text-sm text-destructive">
                {thumbnailMessage}
              </p>
            )}
            {thumbnail.selection.status === 'ready' && (
              <div className="flex flex-col items-start gap-2">
                <img
                  src={thumbnail.selection.previewUrl}
                  alt="썸네일 미리보기"
                  className="aspect-video w-full max-w-xs rounded-xl object-cover"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={state.phase === 'starting'}
                  onClick={handleThumbnailClear}
                >
                  썸네일 선택 취소
                </Button>
              </div>
            )}
          </div>
          {state.phase === 'previewing' && failureMessage && (
            <p role="alert" className="text-destructive">
              {failureMessage}
            </p>
          )}
          <Button type="submit" disabled={state.phase === 'starting'} className="h-12 w-full text-base">
            {state.phase === 'starting' ? '송출 시작 중...' : '송출 시작'}
          </Button>
        </form>
      )}

      {state.phase === 'onAir' && (
        <div className="mt-6 flex flex-col gap-5">
          <CameraView stream={state.stream}>
            <span className="absolute top-3 left-3 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
              LIVE
            </span>
          </CameraView>
          <p className="text-sub">
            경과 시간 <Elapsed startedAt={state.startedAt} />
          </p>
          <CameraSwitch camera={camera} disabled onSwitch={() => {}} />
          <p className="text-sub">{state.maxViewers === null
              ? `시청자 ${state.viewerCount}명`
              : `시청자 ${state.viewerCount}/${state.maxViewers}`}</p>
          <ChatPanel broadcastId={state.broadcastId} className="h-72" />
          <DonationHistory broadcastId={state.broadcastId} />
          {confirmingEnd ? (
            <div role="alertdialog" aria-label="송출 종료 확인" className="flex flex-col gap-3 rounded-2xl bg-card p-5">
              <p className="font-semibold text-foreground">송출을 종료할까요?</p>
              <div className="flex gap-3">
                <Button variant="destructive" className="h-12 flex-1 text-base" onClick={() => void handleEnd()}>
                  종료
                </Button>
                <Button variant="outline" className="h-12 flex-1 text-base" onClick={() => setConfirmingEnd(false)}>
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="destructive"
              className="h-14 w-full text-lg"
              disabled={ending}
              onClick={() => setConfirmingEnd(true)}
            >
              송출 종료
            </Button>
          )}
        </div>
      )}

      {blocker.state === 'blocked' && (
        <div role="alertdialog" aria-label="화면 이동 확인" className="mt-6 flex flex-col gap-3 rounded-2xl bg-card p-5">
          <p className="font-semibold text-foreground">이동하면 방송이 종료됩니다. 이동할까요?</p>
          <div className="flex gap-3">
            <Button variant="destructive" className="h-12 flex-1 text-base" onClick={() => blocker.proceed()}>
              이동
            </Button>
            <Button variant="outline" className="h-12 flex-1 text-base" onClick={() => blocker.reset()}>
              계속 방송
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
