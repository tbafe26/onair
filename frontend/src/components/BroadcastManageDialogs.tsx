import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { broadcastKeys } from '../api/broadcast-keys'
import { decodeFailure, deleteBroadcast, endBroadcast, renameBroadcast } from '../api/broadcasts'
import { useBroadcastInput } from '../hooks/useBroadcastInput'
import { manageFailureMessage } from '../lib/broadcast-view'
import { Button } from './ui/button'
import { Modal } from './Modal'
import { TextField } from './TextField'

interface Target {
  id: number
  title: string
}

/** 제목 수정 입력. 규칙은 등록과 같고, 저장하면 방송 데이터를 새로 받는다. */
export function EditTitleDialog({ broadcast, onClose }: { broadcast: Target; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { input } = useBroadcastInput()
  const [title, setTitle] = useState(broadcast.title)
  const [error, setError] = useState<string | null>(null)

  const rename = useMutation({
    mutationFn: (next: string) => renameBroadcast(broadcast.id, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: broadcastKeys.all })
      onClose()
    },
    onError: (failure) => setError(manageFailureMessage('rename', decodeFailure(failure))),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const problem = input.checkTitle(title)
    setError(problem)
    if (problem === null) rename.mutate(title.trim())
  }

  return (
    <Modal title="제목 수정" onClose={onClose}>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-5" noValidate>
        <TextField
          id="edit-title"
          label="제목"
          value={title}
          error={error}
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={rename.isPending}>
            저장
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** 삭제 확인. 확인하면 지우고, 실패하면 서버가 알려 준 이유(방송 중 등)를 보여 준다. */
export function DeleteBroadcastDialog({
  broadcast,
  onClose,
  onDeleted,
}: {
  broadcast: Target
  onClose: () => void
  onDeleted?: () => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: () => deleteBroadcast(broadcast.id),
    onSuccess: async () => {
      // 지운 방송의 상세는 다시 받지 않는다. 이어서 나머지 목록만 새로 받는다.
      queryClient.removeQueries({ queryKey: broadcastKeys.detail(String(broadcast.id)) })
      await queryClient.invalidateQueries({ queryKey: broadcastKeys.all })
      onClose()
      onDeleted?.()
    },
    onError: (failure) => setError(manageFailureMessage('delete', decodeFailure(failure))),
  })

  return (
    <Modal title="방송 삭제" onClose={onClose}>
      <p className="mt-4 break-words text-foreground">
        &lsquo;{broadcast.title}&rsquo; 방송을 삭제할까요? 영상과 썸네일도 함께 지워지며 되돌릴 수 없습니다.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          취소
        </Button>
        <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
          삭제
        </Button>
      </div>
    </Modal>
  )
}

/** 송출 종료 확인. 확인하면 종료하고 방송 데이터를 새로 받는다. 시청자 화면은 서버가 ended로 바꾼다. */
export function EndBroadcastDialog({ broadcast, onClose }: { broadcast: Target; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const end = useMutation({
    mutationFn: () => endBroadcast(broadcast.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: broadcastKeys.all })
      onClose()
    },
    onError: (failure) => setError(manageFailureMessage('end', decodeFailure(failure))),
  })

  return (
    <Modal title="송출 종료" onClose={onClose}>
      <p className="mt-4 break-words text-foreground">
        &lsquo;{broadcast.title}&rsquo; 송출을 종료할까요? 시청자 화면도 바로 종료되며 다시 시작할 수 없습니다.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          취소
        </Button>
        <Button type="button" variant="destructive" disabled={end.isPending} onClick={() => end.mutate()}>
          송출 종료
        </Button>
      </div>
    </Modal>
  )
}
