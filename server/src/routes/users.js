// 마이페이지: 프로필 조회(Read), 수정(Update), 탈퇴(Delete)
import bcrypt from 'bcrypt'
import { Router } from 'express'
import { deleteSandbox, stopTask } from '../agent/runner.js'
import { ah, clearSession, requireAuth } from '../auth.js'
import db from '../db.js'
import { validateName, validatePassword } from './auth.js'

const router = Router()
router.use(requireAuth)

const profile = (id) =>
  db.get(
    `SELECT u.id, u.email, u.name, u.created_at, COUNT(t.id) AS task_count
       FROM users u
       LEFT JOIN tasks t ON t.user_id = u.id
      WHERE u.id = ?
      GROUP BY u.id, u.email, u.name, u.created_at`,
    [id],
  )

router.get(
  '/me',
  ah(async (req, res) => {
    res.json({ user: await profile(req.user.id) })
  }),
)

router.patch(
  '/me',
  ah(async (req, res) => {
    const [name, nameError] = validateName(req.body?.name)
    if (nameError) return res.status(400).json({ error: nameError })

    const { password } = req.body ?? {}
    if (password) {
      const pwError = validatePassword(password)
      if (pwError) return res.status(400).json({ error: pwError })
      const hash = await bcrypt.hash(password, 10)
      await db.run('UPDATE users SET name = ?, password_hash = ? WHERE id = ?', [name, hash, req.user.id])
    } else {
      await db.run('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id])
    }
    res.json({ user: await profile(req.user.id) })
  }),
)

router.delete(
  '/me',
  ah(async (req, res) => {
    // 탈퇴 전에 돌고 있는 에이전트를 멈추고 샌드박스를 정리한다. 작업과 기록은 ON DELETE CASCADE로 지워진다.
    const tasks = await db.all('SELECT id, sandbox_id FROM tasks WHERE user_id = ?', [req.user.id])
    for (const t of tasks) await stopTask(t.id)
    await db.run('DELETE FROM users WHERE id = ?', [req.user.id])
    clearSession(res)
    res.status(204).end()
    for (const t of tasks) if (t.sandbox_id) deleteSandbox(t.sandbox_id)
  }),
)

export default router
