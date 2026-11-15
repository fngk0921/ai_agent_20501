// 회원가입(Create), 로그인(Read), 로그아웃, 내 세션 조회
import bcrypt from 'bcrypt'
import { Router } from 'express'
import { ah, clearSession, requireAuth, setSession } from '../auth.js'
import db, { now } from '../db.js'

const router = Router()
const SALT_ROUNDS = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) return '비밀번호는 8자 이상이어야 합니다.'
  if (password.length > 72) return '비밀번호는 72자 이하여야 합니다.' // bcrypt 입력 한도
  return null
}

export function validateName(name) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return [null, '이름을 입력해 주세요.']
  if (n.length > 30) return [null, '이름은 30자 이하로 입력해 주세요.']
  return [n, null]
}

router.post(
  '/signup',
  ah(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const { password } = req.body ?? {}
    const [name, nameError] = validateName(req.body?.name)
    if (nameError) return res.status(400).json({ error: nameError })
    if (!EMAIL_RE.test(email) || email.length > 255) return res.status(400).json({ error: '올바른 이메일을 입력해 주세요.' })
    const pwError = validatePassword(password)
    if (pwError) return res.status(400).json({ error: pwError })

    if (await db.get('SELECT 1 AS found FROM users WHERE email = ?', [email])) {
      return res.status(409).json({ error: '이미 가입된 이메일입니다.' })
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const { insertId } = await db.run('INSERT INTO users (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)', [
      email,
      hash,
      name,
      now(),
    ])
    const user = await db.get('SELECT id, email, name, created_at FROM users WHERE id = ?', [insertId])

    setSession(res, user.id)
    res.status(201).json({ user })
  }),
)

router.post(
  '/login',
  ah(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const row = await db.get('SELECT id, email, name, created_at, password_hash FROM users WHERE email = ?', [email])
    const ok = row && (await bcrypt.compare(password, row.password_hash))
    if (!ok) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' })

    const { password_hash: _, ...user } = row
    setSession(res, user.id)
    res.json({ user })
  }),
)

router.post('/logout', (_req, res) => {
  clearSession(res)
  res.status(204).end()
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

export default router
