import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { decodeFailure } from '../api/broadcasts'
import { useAuth } from '../auth/auth-context'
import { safeNextPath } from '../auth/next-path'
import { Button } from '../components/ui/button'
import { TextField } from '../components/TextField'

/** 아이디와 비밀번호로 로그인한다. 로그인하면(이미 로그인했어도) ?next= 주소나 목록으로 간다. */
export function LoginPage() {
  const { state, login } = useAuth()
  const [params] = useSearchParams()
  const rawNext = params.get('next')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [failure, setFailure] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (state.status === 'user') return <Navigate to={safeNextPath(rawNext)} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFailure(null)
    setSubmitting(true)
    try {
      await login(loginId, password)
    } catch (error) {
      setFailure(
        decodeFailure(error).kind === 'unauthorized'
          ? '아이디 또는 비밀번호가 올바르지 않습니다'
          : '로그인하지 못했습니다. 잠시 후 다시 시도하세요',
      )
      setSubmitting(false)
    }
  }

  const signupLink = rawNext ? `/signup?next=${encodeURIComponent(rawNext)}` : '/signup'

  return (
    <section className="mx-auto w-full max-w-md">
      <h1 className="text-[28px] font-extrabold text-foreground">로그인</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5 rounded-2xl bg-card p-4 md:p-6">
        <TextField
          id="login-id"
          label="아이디"
          autoComplete="username"
          value={loginId}
          onChange={(event) => setLoginId(event.target.value)}
          disabled={submitting}
        />
        <TextField
          id="login-password"
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
        />
        {failure && (
          <p role="alert" className="text-destructive">
            {failure}
          </p>
        )}
        <Button type="submit" className="h-11" disabled={submitting}>
          로그인
        </Button>
        <p className="text-center text-sub">
          계정이 없나요?{' '}
          <Link to={signupLink} className="font-semibold text-primary hover:underline">
            회원가입
          </Link>
        </p>
      </form>
    </section>
  )
}
