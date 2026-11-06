import { useState } from 'react'
import { Button } from './ui/button'
import { DeleteBroadcastDialog, EditTitleDialog } from './BroadcastManageDialogs'

/** "제목 수정"·"삭제" 버튼과 각각의 대화상자. 소유자에게만 보여 주는 쪽이 감싸서 쓴다. */
export function BroadcastOwnerActions({
  broadcast,
  onDeleted,
}: {
  broadcast: { id: number; title: string }
  onDeleted?: () => void
}) {
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null)
  const close = () => setDialog(null)
  return (
    <>
      <Button variant="outline" onClick={() => setDialog('edit')}>
        제목 수정
      </Button>
      <Button variant="outline" onClick={() => setDialog('delete')}>
        삭제
      </Button>
      {dialog === 'edit' && <EditTitleDialog broadcast={broadcast} onClose={close} />}
      {dialog === 'delete' && (
        <DeleteBroadcastDialog broadcast={broadcast} onClose={close} onDeleted={onDeleted} />
      )}
    </>
  )
}
