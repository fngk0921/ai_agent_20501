import { BarChart3, Code2, Globe, Pencil, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, notifyTasksChanged } from '../api.js'
import { useAuth } from '../App.jsx'
import Composer from '../components/Composer.jsx'
import { Avatar, Button, Field, Modal, StatusBadge } from '../components/ui.jsx'
import { timeAgo } from '../constants.js'

const SUGGESTIONS = [
  { icon: Globe, label: '웹사이트 만들기', prompt: '소개용 한 페이지 웹사이트를 만들고 미리보기 링크를 줘. ' },
  { icon: BarChart3, label: '데이터 분석', prompt: '샘플 데이터를 만들어 분석하고 핵심 지표를 정리해줘. ' },
  { icon: Code2, label: '코드 작성', prompt: 'Node.js로 다음 기능을 구현하고 테스트까지 돌려줘: ' },
  { icon: Search, label: '자료 조사', prompt: '다음 주제를 공식 문서 위주로 조사해서 요약해줘: ' },
]

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [createError, setCreateError] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'mine'
  const [tasks, setTasks] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [modalError, setModalError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    api('/tasks')
      .then((d) => {
        setTasks(d.tasks)
        setLoadError('')
      })
      .catch((e) => setLoadError(e.message))
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('tasks:changed', load)
    return () => window.removeEventListener('tasks:changed', load)
  }, [load])

  const create = async ({ prompt: text, model }) => {
    setCreateError('')
    try {
      const { task } = await api('/tasks', { method: 'POST', body: { prompt: text, model } })
      notifyTasksChanged()
      navigate(`/tasks/${task.id}`)
      return true
    } catch (e) {
      setCreateError(e.message)
      return false
    }
  }

  const closeModal = () => {
    setEditing(null)
    setDeleting(null)
    setModalError('')
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setSaving(true)
    try {
      await api(`/tasks/${editing.id}`, {
        method: 'PATCH',
        body: { title: form.get('title'), prompt: form.get('prompt') },
      })
      closeModal()
      notifyTasksChanged()
    } catch (err) {
      setModalError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    setSaving(true)
    try {
      await api(`/tasks/${deleting.id}`, { method: 'DELETE' })
      closeModal()
      notifyTasksChanged()
    } catch (err) {
      setModalError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const visible = (tasks ?? []).filter((t) => filter === 'all' || t.user_id === user.id)

  return (
    <div className="page home">
      <section className="hero">
        <h1 className="serif">
          안녕하세요, {user.name}님
          <span>무엇을 도와드릴까요?</span>
        </h1>
        <Composer value={prompt} onChange={setPrompt} onSubmit={create} />
        {createError && (
          <p className="form-error" role="alert">
            {createError}
          </p>
        )}
        <div className="chips">
          {SUGGESTIONS.map(({ icon: Icon, label, prompt: p }) => (
            <button key={label} className="chip" onClick={() => setPrompt(p)}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="feed">
        <header className="section-head">
          <h2>모두의 작업</h2>
          <div className="segmented segmented-sm">
            <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
              전체
            </button>
            <button className={filter === 'mine' ? 'on' : ''} onClick={() => setFilter('mine')}>
              내 작업
            </button>
          </div>
        </header>

        {loadError ? (
          <p className="empty">
            {loadError}{' '}
            <button className="link" onClick={load}>
              다시 시도
            </button>
          </p>
        ) : tasks === null ? (
          <p className="empty">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <p className="empty">아직 작업이 없어요. 위 입력창에서 첫 작업을 맡겨 보세요.</p>
        ) : (
          <div className="grid">
            {visible.map((t) => {
              const own = t.user_id === user.id
              return (
                <article key={t.id} className="card task-card">
                  <Link to={`/tasks/${t.id}`} className="card-link" aria-label={t.title} />
                  <div className="task-card-top">
                    <StatusBadge status={t.status} />
                    {own && (
                      <div className="card-actions">
                        <button className="icon-btn" onClick={() => setEditing(t)} aria-label="수정" title="수정">
                          <Pencil size={15} />
                        </button>
                        <button className="icon-btn" onClick={() => setDeleting(t)} aria-label="삭제" title="삭제">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                  <h3>{t.title}</h3>
                  <p className="clamp">{t.prompt}</p>
                  <footer>
                    <Avatar name={t.author_name} size={22} />
                    <span>{t.author_name}</span>
                    <span className="muted">· {timeAgo(t.created_at)}</span>
                  </footer>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {editing && (
        <Modal title="작업 수정" onClose={closeModal}>
          <form onSubmit={saveEdit} className="stack">
            <Field label="제목" name="title" defaultValue={editing.title} maxLength={100} required />
            <Field label="요청 내용" name="prompt" textarea rows={5} defaultValue={editing.prompt} maxLength={8000} required />
            {modalError && (
              <p className="form-error" role="alert">
                {modalError}
              </p>
            )}
            <div className="row-end">
              <Button type="button" variant="ghost" onClick={closeModal}>
                취소
              </Button>
              <Button type="submit" disabled={saving}>
                저장
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="작업을 삭제할까요?"
          onClose={closeModal}
          footer={
            <>
              <Button variant="ghost" onClick={closeModal}>
                취소
              </Button>
              <Button variant="danger" onClick={confirmDelete} disabled={saving}>
                삭제
              </Button>
            </>
          }
        >
          <p className="muted">‘{deleting.title}’ 작업과 실행 기록, 샌드박스가 삭제되며 되돌릴 수 없습니다.</p>
          {modalError && (
            <p className="form-error" role="alert">
              {modalError}
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}
