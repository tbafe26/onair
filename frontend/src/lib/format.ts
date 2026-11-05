const pad = (value: number) => String(value).padStart(2, '0')

/** 재생 시간 배지 표기: 1시간 이상이면 HH:MM:SS, 아니면 MM:SS. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`
}

/** 카드의 등록일 표기: MM.DD */
export function formatMonthDay(iso: string): string {
  const date = new Date(iso)
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

/** 상세 화면의 등록 일시 표기: YYYY.MM.DD HH:mm */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
