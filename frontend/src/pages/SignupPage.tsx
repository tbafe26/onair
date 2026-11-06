import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { decodeFailure } from '../api/broadcasts'
import { useAuth } from '../auth/auth-context'
import { safeNextPath } from '../auth/next-path'
import { Button } from '../components/ui/button'
import { TextField } from '../components/TextField'

type FieldErrors = Partial<Record<'loginId' | 'password' | 'passwordConfirm' | 'nickname', string>>

/** 아이디·비밀번호·닉네임으로 가입한다. 가입하면 바로 로그인되어 ?next= 주소나 목록으로 간다. */
export function SignupPage() {
  const { state, signup } = useAuth()
  const [params] = useSearchParams()
  const rawNext = params.get('next')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [nickname, setNickname] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (state.status === 'user') return <Navigate to={safeNextPath(rawNext)} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFailure(null)
    if (password !== passwordConfirm) {
      setErrors({ passwordConfirm: '비밀번호가 일치하지 않습니다' })
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await signup({ loginId, password, nickname })
    } catch (error) {
      const decoded = decodeFailure(error)
      if (decoded.kind === 'invalid') {
        setErrors({
          loginId: decoded.fieldErrors.loginId,
          password: decoded.fieldErrors.password,
          nickname: decoded.fieldErrors.nickname,
        })
      } else if (decoded.kind === 'conflict') {
        setErrors({ loginId: decoded.message })
      } else {
        setFailure('가입하지 못했습니다. 잠시 후 다시 시도하세요')
      }
      setSubmitting(false)
    }
  }

  const loginLink = rawNext ? `/login?next=${encodeURIComponent(rawNext)}` : '/login'

  return (
    <section className="mx-auto w-full max-w-md">
      <h1 className="text-[28px] font-extrabold text-foreground">회원가입</h1>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5 rounded-2xl bg-card p-4 md:p-6">
        <TextField
          id="signup-login-id"
          label="아이디"
          hint="영문 소문자와 숫자 4~20자"
          autoComplete="username"
          value={loginId}
          onChange={(event) => setLoginId(event.target.value)}
          error={errors.loginId}
          disabled={submitting}
        />
        <TextField
          id="signup-password"
          label="비밀번호"
          type="password"
          hint="8~64자"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          disabled={submitting}
        />
        <TextField
          id="signup-password-confirm"
          label="비밀번호 확인"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          error={errors.passwordConfirm}
          disabled={submitting}
        />
        <TextField
          id="signup-nickname"
          label="닉네임"
          hint="1~20자"
          autoComplete="nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          error={errors.nickname}
          disabled={submitting}
        />
        {failure && (
          <p role="alert" className="text-destructive">
            {failure}
          </p>
        )}
        <Button type="submit" className="h-11" disabled={submitting}>
          가입하기
        </Button>
        <p className="text-center text-sub">
          이미 계정이 있나요?{' '}
          <Link to={loginLink} className="font-semibold text-primary hover:underline">
            로그인
          </Link>
        </p>
      </form>
    </section>
  )
}
