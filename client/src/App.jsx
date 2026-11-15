import { Menu } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { api } from './api.js'
import Sidebar from './components/Sidebar.jsx'
import { Logo } from './components/ui.jsx'
import AuthPage from './pages/AuthPage.jsx'
import HomePage from './pages/HomePage.jsx'
import MyPage from './pages/MyPage.jsx'
import TaskPage from './pages/TaskPage.jsx'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

function Shell() {
  const { user } = useAuth()
  const [navOpen, setNavOpen] = useState(false) // 모바일 서랍
  if (!user) return <Navigate to="/auth" replace />
  return (
    <div className="shell">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn" onClick={() => setNavOpen(true)} aria-label="메뉴 열기">
            <Menu size={20} />
          </button>
          <Logo size={24} />
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = 확인 중, null = 로그아웃

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
    const expired = () => setUser(null)
    window.addEventListener('auth:expired', expired)
    return () => window.removeEventListener('auth:expired', expired)
  }, [])

  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } })
    setUser(d.user)
  }, [])

  const signup = useCallback(async (name, email, password) => {
    const d = await api('/auth/signup', { method: 'POST', body: { name, email, password } })
    setUser(d.user)
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }, [])

  const auth = useMemo(() => ({ user, setUser, login, signup, logout }), [user, login, signup, logout])

  if (user === undefined) return <div className="boot" aria-busy="true" />

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/tasks/:id" element={<TaskPage />} />
          <Route path="/me" element={<MyPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  )
}
