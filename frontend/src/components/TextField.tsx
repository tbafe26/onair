import type { ComponentProps } from 'react'

const inputClass =
  'h-11 w-full rounded-xl border border-border bg-background px-4 text-foreground outline-none placeholder:text-sub focus-visible:ring-2 focus-visible:ring-ring'

type TextFieldProps = Omit<ComponentProps<'input'>, 'id' | 'className'> & {
  id: string
  label: string
  /** 입력창 근처에 늘 보이는 규칙 안내 */
  hint?: string
  /** 칸별 오류 메시지 */
  error?: string | null
}

/** 라벨, 규칙 안내, 칸별 오류를 한 묶음으로 보여 주는 입력칸. */
export function TextField({ id, label, hint, error, ...props }: TextFieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ')
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold text-title">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={inputClass}
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-sub">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
