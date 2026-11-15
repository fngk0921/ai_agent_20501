import { Home, LogOut, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../App.jsx'
import { Avatar, Logo } from './ui.jsx'

export default function Sidebar({ open = false, onNavigate }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mine, setMine] = useState([])

  // 화면 이동, 작업 변경 알림 때 다시 불러온다.
  useEffect(() => {
    let alive = true
    const load = () =>
      api('/tasks?mine=1')
        .then((d) => alive && setMine(d.tasks))
        .catch(() => {})
    load()
    window.addEventListener('tasks:changed', load)
    return () => {
      alive = false
      window.removeEventListener('tasks:changed', load)
    }
  }, [pathname])

  // 실행 중인 작업이 있으면 5초마다 상태를 갱신한다.
  const hasRunning = mine.some((t) => t.status === 'running' || t.status === 'queued')
  useEffect(() => {
    if (!hasRunning) return
    const timer = setInterval(() => window.dispatchEvent(new Event('tasks:changed')), 5000)
    return () => clearInterval(timer)
  }, [hasRunning])

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} onClick={onNavigate}>
      <div className="sidebar-top">
        <Logo />
      </div>

      <button className="new-task" onClick={() => navigate('/')}>
        <Plus size={16} />
        <span>새 작업</span>
      </button>

      <nav className="nav">
        <NavLink to="/" end className="nav-item">
          <Home size={17} />
          <span>홈</span>
        </NavLink>
      </nav>

      <div className="nav-section">
        <p className="nav-caption">내 작업</p>
        {mine.length === 0 && <p className="nav-empty">아직 맡긴 작업이 없어요</p>}
        {mine.map((t) => (
          <NavLink key={t.id} to={`/tasks/${t.id}`} className="nav-item nav-task" title={t.title}>
            <i className={`dot dot-${t.status}`} />
            <span>{t.title}</span>
          </NavLink>
        ))}
      </div>

      <div className="sidebar-bottom">
        <NavLink to="/me" className="nav-item profile-link">
          <Avatar name={user.name} size={30} />
          <span className="profile-text">
            <b>{user.name}</b>
            <small>{user.email}</small>
          </span>
        </NavLink>
        <button className="icon-btn" onClick={logout} aria-label="로그아웃" title="로그아웃">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
