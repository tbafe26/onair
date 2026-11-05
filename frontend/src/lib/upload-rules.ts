// 등록 입력 규칙. 서버(RegistrationRules)와 같은 규칙을 화면에서 먼저 검사한다. 최종 판단은 서버가 한다.
// 상한 값(영상·썸네일 크기, 제목 길이)은 서버의 업로드 정책에서 받아 쓰고 여기에 적지 않는다.

const KB = 1024
const MB = 1024 * KB

/**
 * 바이트를 "200MB", "512KB" 같은 표기로 바꾼다. 딱 떨어지지 않으면 바이트로 쓴다.
 * 서버(RegistrationRules.formatBytes)와 같은 규칙이라 화면과 서버의 상한 안내가 같다.
 */
export function formatLimit(bytes: number): string {
  if (bytes % MB === 0) return `${bytes / MB}MB`
  if (bytes % KB === 0) return `${bytes / KB}KB`
  return `${bytes}바이트`
}

export function sizeLimitMessage(maxBytes: number): string {
  return `영상은 ${formatLimit(maxBytes)} 이하만 올릴 수 있습니다`
}

// 서버(RegistrationRules.trimWhiteSpace)와 같은 기준: 유니코드 White_Space 속성 문자를 앞뒤에서 뗀다.
const EDGE_WHITE_SPACE = /^\p{White_Space}+|\p{White_Space}+$/gu

export function trimWhiteSpace(value: string): string {
  return value.replace(EDGE_WHITE_SPACE, '')
}

/**
 * 자동으로 만든 썸네일이 서버 상한을 넘으면 보내지 않는다. 썸네일은 선택 항목이라
 * 큰 썸네일 때문에 등록 전체가 거절되는 것보다 썸네일 없이 등록하는 편이 낫다.
 * 상한을 아직 모르면(null) 그대로 보내고 서버에 맡긴다.
 */
export function thumbnailWithinLimit(thumbnail: Blob | null, maxThumbnailBytes: number | null): Blob | null {
  if (thumbnail === null || maxThumbnailBytes === null) return thumbnail
  return thumbnail.size > maxThumbnailBytes ? null : thumbnail
}

/**
 * 앞뒤 공백을 뗀 제목이 1자 이상, 서버 정책의 상한 이하인지 본다. 올바르면 null, 아니면 메시지다.
 * 정책을 아직 모르면(maxTitleLength가 null) 길이 검사는 건너뛰고 서버에 맡긴다.
 */
export function validateTitle(title: string, maxTitleLength: number | null): string | null {
  const trimmed = trimWhiteSpace(title)
  if (trimmed.length === 0) return '제목을 입력하세요'
  if (maxTitleLength !== null && trimmed.length > maxTitleLength) {
    return `제목은 ${maxTitleLength}자 이하로 입력하세요`
  }
  return null
}

/** 파일 앞부분의 시그니처로 mp4/webm인지 본다. 확장자와 type은 보지 않는다. */
export async function hasVideoSignature(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await readBytes(file.slice(0, 8)))
  const isMp4 =
    head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70
  const isWebm =
    head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3
  return isMp4 || isWebm
}

function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

/**
 * 크기와 형식을 검사한다. 올바르면 null, 아니면 메시지다.
 * 서버의 크기 상한을 아직 모르면(maxVideoBytes가 null) 크기 검사는 건너뛰고 서버에 맡긴다.
 */
export async function validateVideoFile(
  file: File,
  maxVideoBytes: number | null,
): Promise<string | null> {
  if (maxVideoBytes !== null && file.size > maxVideoBytes) return sizeLimitMessage(maxVideoBytes)
  if (!(await hasVideoSignature(file))) return 'mp4 또는 webm 영상 파일만 올릴 수 있습니다'
  return null
}
