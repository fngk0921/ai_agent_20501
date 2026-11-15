// 로그인 세션: JWT를 httpOnly 쿠키에 담는다.
import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import db from './db.js'

const COOKIE = 'hobbang_session'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

let secret = process.env.JWT_SECRET
if (!secret) {
  secret = randomBytes(32).toString('hex')
  console.warn('[auth] JWT_SECRET이 없어 임시 값을 씁니다. 서버를 재시작하면 모두 로그아웃됩니다.')
}

// Express 4는 async 핸들러의 오류를 잡지 못하므로 감싸서 오류 처리기로 넘긴다.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function setSession(res, userId) {
  const token = jwt.sign({ sub: userId }, secret, { expiresIn: MAX_AGE_MS / 1000 })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
  })
}

export function clearSession(res) {
  res.clearCookie(COOKIE)
}

// 로그인이 필요한 라우트에 붙인다. 통과하면 req.user가 채워진다.
export const requireAuth = ah(async (req, res, next) => {
  const token = req.cookies?.[COOKIE]
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' })
  let sub
  try {
    ;({ sub } = jwt.verify(token, secret))
  } catch {
    clearSession(res)
    return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해 주세요.' })
  }
  const user = await db.get('SELECT id, email, name, created_at FROM users WHERE id = ?', [sub])
  if (!user) {
    clearSession(res)
    return res.status(401).json({ error: '계정을 찾을 수 없습니다.' })
  }
  req.user = user
  next()
})
