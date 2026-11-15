// Daytona 샌드박스: 작업마다 하나씩 만들고, 이어서 지시하면 같은 샌드박스를 다시 쓴다.
import { Daytona } from '@daytona/sdk'
import { AgentError } from './openai.js'

export const WORKDIR = '/home/daytona/workspace'

let client
function daytona() {
  if (!process.env.DAYTONA_API_KEY) {
    throw new AgentError('DAYTONA_API_KEY가 설정되지 않았습니다. server/.env를 확인해 주세요.')
  }
  client ??= new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    ...(process.env.DAYTONA_API_URL && { apiUrl: process.env.DAYTONA_API_URL }),
    ...(process.env.DAYTONA_TARGET && { target: process.env.DAYTONA_TARGET }),
  })
  return client
}

// 터미널 제어 문자(로그 스트림 구분자, ANSI 색상 코드)를 지운다. 줄바꿈과 탭은 남긴다.
export const stripControl = (s) =>
  String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')

// 셸 문법(파이프, &&)을 쓸 수 있도록 bash로 감싼다.
export const shellQuote = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`

export async function exec(sandbox, command, { cwd = WORKDIR, timeout = 120 } = {}) {
  const r = await sandbox.process.executeCommand(`bash -lc ${shellQuote(command)}`, cwd, undefined, timeout)
  return { exitCode: r.exitCode, output: stripControl(r.result ?? '') }
}

// 기존 샌드박스를 이어 쓰고, 없거나 쓸 수 없으면 새로 만든다.
// 반환: { sandbox, created, note }
export async function ensureSandbox(sandboxId) {
  if (sandboxId) {
    try {
      const sandbox = await daytona().get(sandboxId)
      if (sandbox.state !== 'started') await sandbox.start(120)
      return { sandbox, created: false, note: `기존 샌드박스 다시 사용 (${sandbox.id})` }
    } catch (e) {
      console.warn(`[sandbox] ${sandboxId} 재사용 실패, 새로 만듭니다:`, e.message)
    }
  }
  const sandbox = await daytona().create(
    { language: 'typescript', autoStopInterval: 30, labels: { app: 'hobbang' } },
    { timeout: 180 },
  )
  await exec(sandbox, `mkdir -p ${WORKDIR}`, { cwd: '/' })
  const lostOld = Boolean(sandboxId)
  return {
    sandbox,
    created: true,
    note: lostOld
      ? `이전 샌드박스를 쓸 수 없어 새로 만들었습니다 (${sandbox.id}). 이전 파일은 없습니다.`
      : `새 샌드박스 생성 (${sandbox.id})`,
  }
}

// 브라우저에서 바로 열 수 있도록 토큰이 들어간 링크를 만든다 (1시간 유효).
export async function previewUrl(sandbox, port) {
  const { url } = await sandbox.getSignedPreviewUrl(port, 3600)
  return url
}

export async function deleteSandboxById(sandboxId) {
  const sandbox = await daytona().get(sandboxId)
  await sandbox.delete()
}
