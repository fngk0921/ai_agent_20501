-- DB: ai_agent_20501 (SQLite 파일: server/data/ai_agent_20501.db). db.js가 파일과 테이블을 없으면 만든다.
-- 시간 값은 서버가 UTC 'YYYY-MM-DD HH:MM:SS' 문자열로 직접 넣는다 (MySQL과 같은 형식).

-- 회원
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,            -- bcrypt 해시
  name          TEXT    NOT NULL,
  created_at    TEXT    NOT NULL
);

-- 핵심 데이터: 에이전트에게 맡긴 작업
CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  prompt     TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'queued',  -- queued | running | done | failed | stopped
  model      TEXT    NOT NULL,
  sandbox_id TEXT,                               -- Daytona 샌드박스 ID
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);

-- 작업 실행 기록: 대화 메시지와 도구 호출
CREATE TABLE IF NOT EXISTS task_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES task_events(id) ON DELETE CASCADE, -- 하위 에이전트의 도구 호출이면 위임 이벤트 ID
  kind       TEXT    NOT NULL,                   -- user | text | tool | error
  agent      TEXT,
  title      TEXT,
  tool       TEXT,
  args       TEXT,
  output     TEXT,
  state      TEXT    NOT NULL DEFAULT 'done',    -- running | done | error
  started_at TEXT    NOT NULL,
  ended_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_task ON task_events(task_id);
