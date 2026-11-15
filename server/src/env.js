// server/.env를 읽어 process.env에 넣는다. 가장 먼저 import해야 한다 (index.js 첫 줄).
// node --env-file은 이미 셸에 있는 같은 이름의 변수를 덮어쓰지 않는다. 그러면 셸에 남아 있던
// 다른 OPENAI_API_KEY가 쓰이는 문제가 생겨서, 이 프로젝트의 .env 값이 이기도록 직접 읽는다.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.env')
if (existsSync(file)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (value !== '') process.env[key] = value
  }
}
