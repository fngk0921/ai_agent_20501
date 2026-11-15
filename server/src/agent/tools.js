// 에이전트가 쓰는 도구: 스키마(모델에 보내는 설명), 화면에 보일 제목, 실행 함수
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { dirname, posix } from 'node:path'
import { exec, previewUrl, shellQuote, stripControl, WORKDIR } from './sandbox.js'

const resolve = (p = '.') => (posix.isAbsolute(p) ? p : posix.join(WORKDIR, p))

// 모델에 돌려줄 때는 앞뒤를 남기고 가운데를 자른다 (에러는 보통 끝에 있다).
export function clip(text, max) {
  const s = String(text ?? '')
  if (s.length <= max) return s
  const head = Math.floor(max * 0.4)
  return `${s.slice(0, head)}\n…(${s.length - max}자 생략)…\n${s.slice(s.length - (max - head))}`
}

const fn = (name, description, properties, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

export const SCHEMAS = {
  run_command: fn(
    'run_command',
    `샌드박스(Linux)에서 셸 명령을 실행하고 끝날 때까지 기다린다. 기본 작업 폴더는 ${WORKDIR}. 서버처럼 끝나지 않는 명령은 start_process를 쓴다.`,
    {
      command: { type: 'string', description: '실행할 bash 명령' },
      cwd: { type: 'string', description: '작업 폴더 (선택)' },
      timeout_sec: { type: 'integer', description: '제한 시간(초), 기본 120, 최대 600' },
    },
    ['command'],
  ),
  start_process: fn(
    'start_process',
    '개발 서버처럼 계속 실행되는 프로세스를 백그라운드로 띄우고 처음 몇 초의 로그를 돌려준다. 서버는 0.0.0.0에 바인딩해야 미리보기가 된다.',
    {
      command: { type: 'string', description: '실행할 bash 명령' },
      cwd: { type: 'string', description: '작업 폴더 (선택)' },
    },
    ['command'],
  ),
  write_file: fn(
    'write_file',
    '파일 전체 내용을 쓴다. 폴더가 없으면 만든다. 기존 파일은 덮어쓴다.',
    {
      path: { type: 'string', description: `경로 (상대 경로는 ${WORKDIR} 기준)` },
      content: { type: 'string', description: '파일 내용 전체' },
    },
    ['path', 'content'],
  ),
  read_file: fn(
    'read_file',
    '파일을 줄 번호와 함께 읽는다.',
    {
      path: { type: 'string' },
      start_line: { type: 'integer', description: '시작 줄 (기본 1)' },
      max_lines: { type: 'integer', description: '읽을 줄 수 (기본 400)' },
    },
    ['path'],
  ),
  list_files: fn(
    'list_files',
    '폴더 구조를 보여준다. node_modules와 .git은 제외한다.',
    {
      path: { type: 'string', description: '기본은 작업 폴더' },
      depth: { type: 'integer', description: '깊이 (기본 3)' },
    },
  ),
  fetch_url: fn(
    'fetch_url',
    '웹 페이지나 문서를 가져와 태그를 걷어낸 본문을 돌려준다. 공식 문서 확인용.',
    { url: { type: 'string', description: 'http(s) URL' } },
    ['url'],
  ),
  get_preview_url: fn(
    'get_preview_url',
    '샌드박스에서 열린 포트의 미리보기 링크를 만든다 (1시간 유효). 사용자에게 결과를 보여줄 때 쓴다.',
    { port: { type: 'integer' } },
    ['port'],
  ),
  todo_write: fn(
    'todo_write',
    '할 일 목록 전체를 새로 쓴다. 여러 단계 작업은 시작할 때 만들고, 진행할 때마다 상태를 바꾼다. in_progress는 한 번에 하나만.',
    {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          },
          required: ['content', 'status'],
        },
      },
    },
    ['todos'],
  ),
  delegate_task: fn(
    'delegate_task',
    '하위 에이전트에게 일을 맡기고 결과 보고를 받는다. 서로 독립적인 위임은 한 번의 응답에서 여러 개 호출하면 동시에 실행된다.',
    {
      agent: {
        type: 'string',
        enum: ['explore', 'librarian', 'oracle', 'frontend'],
        description:
          'explore: 샌드박스 코드 탐색 / librarian: 외부 공식 문서·예제 조사 / oracle: 설계 검토와 막힌 문제 조언 / frontend: UI 구현',
      },
      title: { type: 'string', description: '화면에 보일 짧은 제목 (사용자 언어로, 25자 이내)' },
      prompt: { type: 'string', description: '맡길 일. 목표, 알고 있는 사실, 보고 형식을 구체적으로.' },
    },
    ['agent', 'title', 'prompt'],
  ),
}

// 작업 도구에는 '지금 무엇을 하는지' 한 문장(intent)을 받는다. 화면의 도구 줄에 그대로 보인다.
const INTENT = {
  type: 'string',
  description: '이 호출로 하는 일을 사용자 언어로 쓴 한 문장. 명령어가 아니라 목적을 쓴다. 예: "서버 파일을 작성합니다.", "Express 라우팅 공식 문서를 확인합니다."',
}
for (const name of ['run_command', 'start_process', 'write_file', 'read_file', 'list_files', 'fetch_url', 'get_preview_url']) {
  const params = SCHEMAS[name].function.parameters
  params.properties = { intent: INTENT, ...params.properties }
  params.required = ['intent', ...params.required]
}

// 화면에 보일 한 줄 제목: intent가 있으면 그 문장, 없으면 도구별 기본 문구
export function titleFor(name, a, ctx) {
  if (a.intent && name !== 'todo_write' && name !== 'delegate_task') return String(a.intent).trim().slice(0, 200)
  switch (name) {
    case 'run_command':
      return `명령 실행 · ${a.command}`
    case 'start_process':
      return `프로세스 시작 · ${a.command}`
    case 'write_file':
      return `파일 작성 · ${a.path}`
    case 'read_file':
      return `파일 읽기 · ${a.path}`
    case 'list_files':
      return `파일 목록 · ${a.path || '.'}`
    case 'fetch_url':
      return `웹 페이지 · ${String(a.url ?? '').replace(/^https?:\/\/(www\.)?/i, '')}`
    case 'get_preview_url':
      return `미리보기 링크 · 포트 ${a.port}`
    case 'todo_write': {
      const todos = Array.isArray(a.todos) ? a.todos : []
      return `할 일 목록 (${todos.filter((t) => t.status === 'completed').length}/${todos.length})`
    }
    case 'delegate_task':
      return a.title || ctx?.agentLabel || '하위 작업'
    default:
      return name
  }
}

// 화면에 저장할 인수 (긴 파일 내용은 줄인다)
export function displayArgs(name, a) {
  const { intent: _, ...rest } = a
  const shown = name === 'write_file' ? { ...rest, content: clip(rest.content, 2500) } : rest
  return JSON.stringify(shown, null, 2)
}

// ───────── 서버에서 공개 웹 페이지 읽기 ─────────
// 서버 내부망(localhost, 사설 IP, 클라우드 메타데이터 주소)으로는 요청하지 않는다.
function isPrivateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  )
}

async function assertPublicUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    throw new Error('올바른 URL이 아닙니다.')
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('http(s) URL만 가져올 수 있습니다.')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new Error(`주소를 찾을 수 없습니다: ${host}`)
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error('내부 네트워크 주소는 가져올 수 없습니다.')
  return u
}

function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/pre)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

// 한국 공공기관 사이트처럼 EUC-KR인 페이지가 있어서, 헤더나 <meta charset>의 인코딩으로 읽는다.
function decodeBody(buf, type) {
  let charset = /charset=["']?([\w-]+)/i.exec(type)?.[1]
  if (!charset && /html/i.test(type)) charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1'))?.[1]
  try {
    return new TextDecoder(charset?.toLowerCase() || 'utf-8').decode(buf)
  } catch {
    return new TextDecoder('utf-8').decode(buf)
  }
}

async function fetchPublicPage(raw, signal) {
  let url = await assertPublicUrl(raw)
  // 리다이렉트도 한 단계씩 같은 검사를 거친다.
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HOBBANG-agent)', Accept: 'text/html,text/plain,application/json' },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).href)
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const type = res.headers.get('content-type') || ''
    if (!/text|json|xml|javascript/.test(type)) throw new Error(`텍스트 문서가 아닙니다 (${type || '알 수 없음'})`)
    const body = decodeBody(Buffer.from(await res.arrayBuffer()).subarray(0, 2_000_000), type)
    const text = /html/.test(type) ? htmlToText(body) : body
    return `${url.href}\n\n${text.slice(0, 20000)}` || '(본문이 비어 있습니다)'
  }
  throw new Error('리다이렉트가 너무 많습니다.')
}

let processSeq = 0

export const RUN = {
  async run_command(ctx, { command, cwd, timeout_sec }) {
    const timeout = Math.min(Math.max(Number(timeout_sec) || 120, 5), 600)
    const r = await exec(ctx.sandbox, command, { cwd: resolve(cwd), timeout })
    return `exit code ${r.exitCode}\n${r.output}`
  },

  async start_process(ctx, { command, cwd }) {
    const sessionId = `proc-${Date.now()}-${++processSeq}`
    const proc = ctx.sandbox.process
    await proc.createSession(sessionId)
    const { cmdId } = await proc.executeSessionCommand(sessionId, {
      command: `cd ${shellQuote(resolve(cwd))} && ${command}`,
      runAsync: true,
    })
    await new Promise((r) => setTimeout(r, 5000))
    const logs = await proc.getSessionCommandLogs(sessionId, cmdId)
    return `백그라운드 실행 중 (session ${sessionId})\n${stripControl(logs.output ?? logs.stdout ?? '')}`
  },

  async write_file(ctx, { path, content }) {
    const full = resolve(path)
    await exec(ctx.sandbox, `mkdir -p ${shellQuote(dirname(full))}`, { cwd: '/' })
    await ctx.sandbox.fs.uploadFile(Buffer.from(String(content ?? ''), 'utf8'), full)
    return `${full}에 ${Buffer.byteLength(String(content ?? ''))}바이트를 썼습니다.`
  },

  async read_file(ctx, { path, start_line, max_lines }) {
    const from = Math.max(Number(start_line) || 1, 1)
    const to = from + Math.min(Math.max(Number(max_lines) || 400, 1), 2000) - 1
    const r = await exec(ctx.sandbox, `cat -n ${shellQuote(resolve(path))} | sed -n '${from},${to}p'`)
    return r.output || '(빈 파일이거나 범위 밖입니다)'
  },

  async list_files(ctx, { path, depth }) {
    const d = Math.min(Math.max(Number(depth) || 3, 1), 6)
    const r = await exec(
      ctx.sandbox,
      `find ${shellQuote(resolve(path))} -maxdepth ${d} -not -path '*/node_modules*' -not -path '*/.git/*' | sort | head -300`,
    )
    return r.output || '(비어 있음)'
  },

  // Daytona 샌드박스는 허용된 도메인(npm, GitHub 등)만 나갈 수 있어서, 문서 읽기는 서버에서 한다.
  async fetch_url(ctx, { url }) {
    return fetchPublicPage(String(url ?? ''), ctx.signal)
  },

  async get_preview_url(ctx, { port }) {
    const p = Number(port)
    if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error('올바른 포트 번호가 아닙니다.')
    return previewUrl(ctx.sandbox, p)
  },

  async todo_write(ctx, { todos }) {
    if (!Array.isArray(todos)) throw new Error('todos는 배열이어야 합니다.')
    ctx.todos = todos.map((t) => ({ content: String(t.content), status: t.status }))
    const mark = { completed: '[x]', in_progress: '[>]', pending: '[ ]' }
    return ctx.todos.map((t) => `${mark[t.status] ?? '[ ]'} ${t.content}`).join('\n')
  },

  // delegate_task는 runner.js에서 처리한다 (하위 에이전트 루프를 돌려야 하므로).
}
