import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../App.jsx'
import { Avatar, Button, Modal } from '../components/ui.jsx'
import { formatDate } from '../constants.js'

// 설정 화면 관례를 따른 구성: 카드 없이 "왼쪽 라벨 · 오른쪽 값" 행과 구분선만 쓴다.
function Row({ label, hint, wide, children }) {
  return (
    <div className={`row ${wide ? 'row-wide' : ''}`}>
      <div className="row-label">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  )
}

export default function MyPage() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')

  useEffect(() => {
    api('/users/me')
      .then((d) => setProfile(d.user))
      .catch((e) => setError(e.message))
  }, [])

  const save = async (e) => {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const body = { name: form.get('name') }
    if (form.get('password')) body.password = form.get('password')
    setSaving(true)
    setError('')
    try {
      const d = await api('/users/me', { method: 'PATCH', body })
      setProfile(d.user)
      setUser((u) => ({ ...u, name: d.user.name }))
      formEl.password.value = ''
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const leave = async () => {
    try {
      await api('/users/me', { method: 'DELETE' })
      setUser(null)
      navigate('/auth', { replace: true })
    } catch (err) {
      setLeaveError(err.message)
    }
  }

  return (
    <div className="page settings">
      <header className="page-head">
        <h1 className="serif">마이페이지</h1>
      </header>

      <form className="settings-group" onSubmit={save}>
        <h2>프로필</h2>
        <Row label="프로필 사진">
          <Avatar name={user.name} size={40} />
        </Row>
        <Row label="이름">
          <input className="input" name="name" defaultValue={user.name} aria-label="이름" maxLength={30} required />
        </Row>
        <Row label="이메일" hint="로그인에 사용하며 변경할 수 없습니다.">
          <span className="row-value">{user.email}</span>
        </Row>
        <Row label="새 비밀번호" hint="변경할 때만 입력하세요.">
          <input
            className="input"
            name="password"
            type="password"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            aria-label="새 비밀번호"
            placeholder="8자 이상"
          />
        </Row>
        <div className="settings-save">
          {error && (
            <span className="form-error" role="alert">
              {error}
            </span>
          )}
          {saved && <span className="saved">저장되었습니다</span>}
          <Button type="submit" disabled={saving}>
            변경사항 저장
          </Button>
        </div>
      </form>

      <section className="settings-group">
        <h2>계정</h2>
        <Row label="가입일">
          <span className="row-value">{formatDate(profile?.created_at ?? user.created_at)}</span>
        </Row>
        <Row label="내 작업">
          <span className="row-value">{profile ? `${profile.task_count}개` : '…'}</span>
        </Row>
        <Row label="로그아웃" wide>
          <Button type="button" variant="outline" onClick={logout}>
            로그아웃
          </Button>
        </Row>
        <Row label="회원 탈퇴" hint="계정과 내가 만든 모든 작업, 샌드박스가 삭제되며 되돌릴 수 없습니다." wide>
          <Button type="button" variant="danger-outline" onClick={() => setLeaving(true)}>
            탈퇴하기
          </Button>
        </Row>
      </section>

      {leaving && (
        <Modal
          title="정말 탈퇴하시겠어요?"
          onClose={() => setLeaving(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setLeaving(false)}>
                취소
              </Button>
              <Button variant="danger" onClick={leave}>
                탈퇴
              </Button>
            </>
          }
        >
          <p className="muted">작업 {profile?.task_count ?? 0}개와 프로필 정보가 영구적으로 삭제됩니다.</p>
          {leaveError && (
            <p className="form-error" role="alert">
              {leaveError}
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}
