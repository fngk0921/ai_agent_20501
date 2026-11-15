import './env.js' // 반드시 첫 줄: 다른 모듈이 환경 변수를 읽기 전에 .env를 적용한다
import cookieParser from 'cookie-parser'
import express from 'express'
import { MODELS } from './config.js'
import { DB_CLIENT, DB_NAME } from './db.js'
import authRoutes from './routes/auth.js'
import taskRoutes from './routes/tasks.js'
import userRoutes from './routes/users.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(express.json({ limit: '200kb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    db: DB_NAME,
    dbClient: DB_CLIENT,
    openai: Boolean(process.env.OPENAI_API_KEY),
    daytona: Boolean(process.env.DAYTONA_API_KEY),
  })
})
app.get('/api/models', (_req, res) => res.json({ models: MODELS }))
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/tasks', taskRoutes)

app.use('/api', (_req, res) => res.status(404).json({ error: '없는 경로입니다.' }))

// 처리하지 못한 오류는 내부 정보 없이 응답한다.
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '요청 형식이 올바르지 않습니다.' })
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '요청이 너무 큽니다.' })
  console.error(err)
  res.status(500).json({ error: '서버 오류가 발생했습니다.' })
})

app.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT} (db: ${DB_CLIENT} ${DB_NAME})`)
  if (!process.env.OPENAI_API_KEY) console.warn('[config] OPENAI_API_KEY가 없어 에이전트가 실행되지 않습니다.')
  if (!process.env.DAYTONA_API_KEY) console.warn('[config] DAYTONA_API_KEY가 없어 샌드박스를 만들 수 없습니다.')
})
