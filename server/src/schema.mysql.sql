-- DB: ai_agent_20501 (MySQL 8 / MariaDB). db.js가 데이터베이스와 아래 테이블을 없으면 만든다.
-- 시간 값은 서버가 UTC 'YYYY-MM-DD HH:MM:SS' 문자열로 직접 넣는다 (SQLite와 같은 형식).

-- 회원
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,          -- bcrypt 해시
  name          VARCHAR(100) NOT NULL,
  created_at    DATETIME     NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 핵심 데이터: 에이전트에게 맡긴 작업
CREATE TABLE IF NOT EXISTS tasks (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  title      VARCHAR(200) NOT NULL,
  prompt     TEXT         NOT NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'queued',  -- queued | running | done | failed | stopped
  model      VARCHAR(100) NOT NULL,
  sandbox_id VARCHAR(100) NULL,                       -- Daytona 샌드박스 ID
  created_at DATETIME     NOT NULL,
  updated_at DATETIME     NOT NULL,
  INDEX idx_tasks_user (user_id),
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 작업 실행 기록: 대화 메시지와 도구 호출
CREATE TABLE IF NOT EXISTS task_events (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  task_id    INT         NOT NULL,
  parent_id  INT         NULL,                        -- 하위 에이전트의 도구 호출이면 위임 이벤트 ID
  kind       VARCHAR(10) NOT NULL,                    -- user | text | tool | error
  agent      VARCHAR(20) NULL,
  title      MEDIUMTEXT  NULL,
  tool       VARCHAR(50) NULL,
  args       MEDIUMTEXT  NULL,
  output     MEDIUMTEXT  NULL,
  state      VARCHAR(10) NOT NULL DEFAULT 'done',     -- running | done | error
  started_at DATETIME    NOT NULL,
  ended_at   DATETIME    NULL,
  INDEX idx_events_task (task_id),
  CONSTRAINT fk_events_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_parent FOREIGN KEY (parent_id) REFERENCES task_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
