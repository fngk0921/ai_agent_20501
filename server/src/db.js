// DB 연결. .env의 DB_CLIENT로 sqlite / mysql 중 하나를 고른다. ORM 없이 SQL 문을 직접 실행한다.
// 시작할 때 DB(파일 또는 데이터베이스)와 테이블이 없으면 만든다.
//
// 사용법 (모두 Promise):
//   db.get(sql, params)  → 한 행 또는 undefined
//   db.all(sql, params)  → 행 배열
//   db.run(sql, params)  → { insertId, changes }
// 시간 값은 now()로 만든 UTC 문자열을 직접 넣는다. (SQLite의 datetime('now')와 MySQL의 NOW()가 달라서)
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DB_NAME = process.env.DB_NAME || 'ai_agent_20501'
export const DB_CLIENT = (process.env.DB_CLIENT || 'sqlite').toLowerCase()

export const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

const here = dirname(fileURLToPath(import.meta.url))
const schema = (name) => readFileSync(join(here, name), 'utf8')
// undefined는 드라이버가 받지 않으므로 null로 바꾼다.
const clean = (params) => params.map((p) => (p === undefined ? null : p))

async function openSqlite() {
  const { default: Database } = await import('better-sqlite3')
  const dataDir = join(here, '..', 'data')
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, `${DB_NAME}.db`)
  const isNew = !existsSync(file)

  const sqlite = new Database(file) // 파일이 없으면 새로 만든다
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(schema('schema.sqlite.sql'))
  console.log(`[db] sqlite ${isNew ? '새 파일 생성' : '연결'}: ${file}`)

  return {
    get: async (sql, params = []) => sqlite.prepare(sql).get(...clean(params)),
    all: async (sql, params = []) => sqlite.prepare(sql).all(...clean(params)),
    run: async (sql, params = []) => {
      const r = sqlite.prepare(sql).run(...clean(params))
      return { insertId: Number(r.lastInsertRowid), changes: r.changes }
    },
  }
}

async function openMysql() {
  const mysql = await import('mysql2/promise')
  if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) throw new Error(`DB_NAME에는 영문, 숫자, _만 쓸 수 있습니다: ${DB_NAME}`)
  const conn = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    charset: 'utf8mb4',
  }

  // 데이터베이스가 없으면 만든다.
  const admin = await mysql.createConnection(conn)
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await admin.end()

  const pool = mysql.createPool({
    ...conn,
    database: DB_NAME,
    dateStrings: true, // DATETIME을 Date 객체가 아니라 'YYYY-MM-DD HH:MM:SS' 문자열로 받는다
    timezone: 'Z',
    multipleStatements: true, // 스키마 파일 실행용
    connectionLimit: 10,
  })
  await pool.query(schema('schema.mysql.sql'))
  console.log(`[db] mysql 연결: ${conn.user}@${conn.host}:${conn.port}/${DB_NAME}`)

  return {
    get: async (sql, params = []) => (await pool.execute(sql, clean(params)))[0][0],
    all: async (sql, params = []) => (await pool.execute(sql, clean(params)))[0],
    run: async (sql, params = []) => {
      const [r] = await pool.execute(sql, clean(params))
      return { insertId: r.insertId, changes: r.affectedRows }
    },
  }
}

async function open() {
  if (DB_CLIENT === 'sqlite') return openSqlite()
  if (DB_CLIENT === 'mysql') return openMysql()
  throw new Error(`DB_CLIENT는 sqlite 또는 mysql이어야 합니다 (지금 값: ${DB_CLIENT})`)
}

const db = await open()

// 서버가 꺼질 때 실행 중이던 작업은 이어서 돌릴 수 없으므로 중지로 정리한다.
await db.run(`UPDATE task_events SET state = 'error', ended_at = ? WHERE state = 'running'`, [now()])
await db.run(`UPDATE tasks SET status = 'stopped', updated_at = ? WHERE status IN ('queued', 'running')`, [now()])

export default db
