import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { broadcastKeys } from '../api/broadcast-keys'
import { fetchUploadPolicy } from '../api/broadcasts'
import { createBroadcastInput } from '../lib/broadcast-input'
import { browserImageDeps } from '../lib/thumbnail-image-browser'

/** 서버의 업로드 정책을 받아 방송 입력 규칙을 만든다. 받기 전이나 실패했을 때는 서버에 맡기는 규칙이다. */
export function useBroadcastInput() {
  const { data: uploadPolicy } = useQuery({
    queryKey: broadcastKeys.uploadPolicy(),
    queryFn: fetchUploadPolicy,
    retry: false,
  })
  const input = useMemo(() => createBroadcastInput(uploadPolicy ?? null, browserImageDeps), [uploadPolicy])
  return { input, uploadPolicy: uploadPolicy ?? null }
}
