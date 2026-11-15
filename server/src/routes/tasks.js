// 핵심 데이터(작업) CRUD + 실행 제어
import { Router } from 'express'
import { deleteSandbox, isRunning, startTask, stopTask } from '../agent/runner.js'
import { ah, requireAuth } from '../auth.js'
import { MODELS } from '../config.js'
import db, { now } from '../db.js'

const router = Router()
router.use(requireAuth)

// tasks JOIN users: 작업 목록과 작성자 정보를 함께 조회
const SELECT_TASKS = `
  SELECT t.id, t.title, t.prompt, t.status, t.model, t.sandbox_id, t.created_at, t.updated_at, t.user_id,
         u.name AS author_name, u.email AS author_email
    FROM tasks t
    JOIN users u ON u.id = t.user_id`

const getOne = (id) => db.get(`${SELECT_TASKS} WHERE t.id = ?`, [id])
const addUserEvent = (taskId, text) =>
  db.run(`INSERT INTO task_events (task_id, kind, title, started_at) VALUES (?, 'user', ?, ?)`, [taskId, text, now()])

function makeTitle(prompt) {
  const line = prompt.split('\n').find((l) => l.trim()) ?? prompt
  const t = line.trim()
  return t.length > 40 ? `${t.slice(0, 40)}…` : t
}

function cleanText(value, max) {
  const s = typeof value === 'string' ? value.trim() : ''
  return s.length > max ? null : s
}

// 본인 작업인지 확인. 아니면 응답을 보내고 null을 돌려준다.
async function ownTask(req, res) {
  const task = await getOne(req.params.id)
  if (!task) {
    res.status(404).json({ error: '작업을 찾을 수 없습니다.' })
    return null
  }
  if (task.user_id !== req.user.id) {
    res.status(403).json({ error: '본인이 만든 작업만 변경할 수 있습니다.' })
    return null
  }
  return task
}

// Read: 모든 사용자의 작업 목록 (?mine=1이면 내 작업만)
router.get(
  '/',
  ah(async (req, res) => {
    const tasks = req.query.mine
      ? await db.all(`${SELECT_TASKS} WHERE t.user_id = ? ORDER BY t.id DESC`, [req.user.id])
      : await db.all(`${SELECT_TASKS} ORDER BY t.id DESC`)
    res.json({ tasks })
  }),
)

// Read: 작업 하나 + 실행 기록
router.get(
  '/:id',
  ah(async (req, res) => {
    const task = await getOne(req.params.id)
    if (!task) return res.status(404).json({ error: '작업을 찾을 수 없습니다.' })
    const events = await db.all(
      `SELECT id, parent_id, kind, agent, title, tool, args, output, state, started_at, ended_at
         FROM task_events WHERE task_id = ? ORDER BY id`,
      [task.id],
    )
    res.json({ task, events })
  }),
)

// Create: 로그인한 사용자만. 만들자마자 에이전트를 실행한다.
router.post(
  '/',
  ah(async (req, res) => {
    const prompt = cleanText(req.body?.prompt, 8000)
    if (!prompt) return res.status(400).json({ error: '요청 내용을 입력해 주세요. (최대 8000자)' })
    const model = req.body?.model
    if (!MODELS.some((m) => m.id === model)) return res.status(400).json({ error: '지원하지 않는 모델입니다.' })

    const t = now()
    const { insertId: id } = await db.run(
      'INSERT INTO tasks (user_id, title, prompt, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, makeTitle(prompt), prompt, model, t, t],
    )
    await addUserEvent(id, prompt)

    await startTask(id)
    res.status(201).json({ task: await getOne(id) })
  }),
)

// Update: 본인 작업의 제목·요청 내용 수정
router.patch(
  '/:id',
  ah(async (req, res) => {
    const task = await ownTask(req, res)
    if (!task) return
    const title = cleanText(req.body?.title, 100)
    const prompt = cleanText(req.body?.prompt, 8000)
    if (!title) return res.status(400).json({ error: '제목을 입력해 주세요. (최대 100자)' })
    if (!prompt) return res.status(400).json({ error: '요청 내용을 입력해 주세요. (최대 8000자)' })

    await db.run('UPDATE tasks SET title = ?, prompt = ?, updated_at = ? WHERE id = ? AND user_id = ?', [
      title,
      prompt,
      now(),
      task.id,
      req.user.id,
    ])
    res.json({ task: await getOne(task.id) })
  }),
)

// Delete: 본인 작업 삭제. 실행 중이면 멈추고 샌드박스도 지운다.
router.delete(
  '/:id',
  ah(async (req, res) => {
    const task = await ownTask(req, res)
    if (!task) return
    await stopTask(task.id)
    await db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [task.id, req.user.id])
    res.status(204).end()
    if (task.sandbox_id) deleteSandbox(task.sandbox_id)
  }),
)

// 이어서 지시하기: 같은 샌드박스에서 에이전트를 다시 돌린다.
router.post(
  '/:id/messages',
  ah(async (req, res) => {
    const task = await ownTask(req, res)
    if (!task) return
    if (isRunning(task.id)) return res.status(409).json({ error: '작업이 끝난 뒤에 메시지를 보낼 수 있습니다.' })
    const text = cleanText(req.body?.text, 8000)
    if (!text) return res.status(400).json({ error: '메시지를 입력해 주세요. (최대 8000자)' })

    await addUserEvent(task.id, text)
    await startTask(task.id)
    res.status(202).json({ task: await getOne(task.id) })
  }),
)

router.post(
  '/:id/stop',
  ah(async (req, res) => {
    const task = await ownTask(req, res)
    if (!task) return
    await stopTask(task.id)
    res.json({ task: await getOne(task.id) })
  }),
)

export default router
