import { useState } from 'react'
import { Button } from './ui/button'
import { DeleteBroadcastDialog, EditTitleDialog, EndBroadcastDialog } from './BroadcastManageDialogs'

/** "제목 수정"·"삭제"(방송 중이면 "송출 종료") 버튼과 각각의 대화상자. 소유자에게만 보여 주는 쪽이 감싸서 쓴다. */
export function BroadcastOwnerActions({
  broadcast,
  onAir = false,
  onDeleted,
}: {
  broadcast: { id: number; title: string }
  /** 방송 중인 라이브방송이면 true. "송출 종료" 버튼을 보여 준다. */
  onAir?: boolean
  onDeleted?: () => void
}) {
  const [dialog, setDialog] = useState<'edit' | 'delete' | 'end' | null>(null)
  const close = () => setDialog(null)
  return (
    <>
      {onAir && (
        <Button variant="outline" onClick={() => setDialog('end')}>
          송출 종료
        </Button>
      )}
      <Button variant="outline" onClick={() => setDialog('edit')}>
        제목 수정
      </Button>
      <Button variant="outline" onClick={() => setDialog('delete')}>
        삭제
      </Button>
      {dialog === 'edit' && <EditTitleDialog broadcast={broadcast} onClose={close} />}
      {dialog === 'end' && <EndBroadcastDialog broadcast={broadcast} onClose={close} />}
      {dialog === 'delete' && (
        <DeleteBroadcastDialog broadcast={broadcast} onClose={close} onDeleted={onDeleted} />
      )}
    </>
  )
}
