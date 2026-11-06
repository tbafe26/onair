import { useState } from 'react'
import { useAuth } from '../auth/auth-context'
import { viewBroadcast, type ViewableBroadcast } from '../lib/broadcast-view'
import { Button } from './ui/button'
import { DeleteBroadcastDialog, EditTitleDialog, EndBroadcastDialog } from './BroadcastManageDialogs'

/** 허용된 관리 동작("제목 수정"·"삭제"·"송출 종료")의 버튼과 대화상자. 허용된 동작이 없으면 아무것도 그리지 않는다. */
export function BroadcastOwnerActions({
  broadcast,
  className,
  onDeleted,
}: {
  broadcast: ViewableBroadcast & { id: number; title: string }
  className?: string
  onDeleted?: () => void
}) {
  const { state } = useAuth()
  const [dialog, setDialog] = useState<'edit' | 'delete' | 'end' | null>(null)
  const { actions } = viewBroadcast(broadcast, state)
  if (!actions.rename && !actions.remove && !actions.end) return null
  const close = () => setDialog(null)
  return (
    <div className={className}>
      {actions.end && (
        <Button variant="outline" onClick={() => setDialog('end')}>
          송출 종료
        </Button>
      )}
      {actions.rename && (
        <Button variant="outline" onClick={() => setDialog('edit')}>
          제목 수정
        </Button>
      )}
      {actions.remove && (
        <Button variant="outline" onClick={() => setDialog('delete')}>
          삭제
        </Button>
      )}
      {dialog === 'edit' && <EditTitleDialog broadcast={broadcast} onClose={close} />}
      {dialog === 'end' && <EndBroadcastDialog broadcast={broadcast} onClose={close} />}
      {dialog === 'delete' && (
        <DeleteBroadcastDialog broadcast={broadcast} onClose={close} onDeleted={onDeleted} />
      )}
    </div>
  )
}
