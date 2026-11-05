import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 조건부 클래스를 합치고 Tailwind 충돌을 정리한다(shadcn/ui 표준 도우미). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
