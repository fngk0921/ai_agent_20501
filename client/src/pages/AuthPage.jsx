import { useState } from 'react'
import { useAuth } from '../App.jsx'
import { Button, Field, Logo } from '../components/ui.jsx'

export default function AuthPage() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isSignup = mode === 'signup'

  const switchMode = (next) => {
    setMode(next)
    setError('')
  }

  const submit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = form.get('email')
    const password = form.get('password')
    if (isSignup && password !== form.get('password2')) {
      setError('비밀번호 확인이 일치하지 않습니다.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (isSignup) await signup(form.get('name'), email, password)
      else await login(email, password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <Logo size={34} />
        <h1 className="serif">{isSignup ? '계정을 만들어 시작하세요' : '다시 오신 걸 환영해요'}</h1>
        <p className="muted">생각은 당신이, 실행은 HOBBANG이.</p>

        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={!isSignup} className={!isSignup ? 'on' : ''} onClick={() => switchMode('login')}>
            로그인
          </button>
          <button role="tab" aria-selected={isSignup} className={isSignup ? 'on' : ''} onClick={() => switchMode('signup')}>
            회원가입
          </button>
        </div>

        <form key={mode} onSubmit={submit} className="stack">
          {isSignup && <Field label="이름" name="name" placeholder="홍길동" maxLength={30} autoComplete="name" required />}
          <Field label="이메일" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          <Field
            label="비밀번호"
            name="password"
            type="password"
            placeholder="••••••••"
            minLength={isSignup ? 8 : undefined}
            maxLength={72}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            hint={isSignup ? '8자 이상 입력해 주세요.' : undefined}
          />
          {isSignup && (
            <Field label="비밀번호 확인" name="password2" type="password" placeholder="••••••••" autoComplete="new-password" required />
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? '잠시만요…' : isSignup ? '가입하기' : '로그인'}
          </Button>
        </form>

        <p className="auth-switch">
          {isSignup ? '이미 계정이 있나요?' : '아직 계정이 없나요?'}{' '}
          <button className="link" onClick={() => switchMode(isSignup ? 'login' : 'signup')}>
            {isSignup ? '로그인' : '회원가입'}
          </button>
        </p>
      </div>
    </div>
  )
}
