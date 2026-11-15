import {
  AlertCircle,
  Box,
  Compass,
  FileSearch,
  FileText,
  FolderTree,
  Globe,
  ListTodo,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  GitBranch,
  Loader,
  Monitor,
  SkipBack,
  SkipForward,
  SquareTerminal,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, notifyTasksChanged } from '../api.js'
import { useAuth } from '../App.jsx'
import Composer from '../components/Composer.jsx'
import { Avatar, Logo, StatusBadge } from '../components/ui.jsx'
import { AGENTS, duration, STATUS } from '../constants.js'

const POLL_MS = 1500

// 에이전트 글 렌더러: `코드`, **굵게**, [링크](URL), 맨 URL만 지원한다 (HTML은 그대로 글자로 보인다).
const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()`'"]+[^\s<>()`'".,!?;:])/g
function linkify(text, key) {
  const out = []
  let last = 0
  for (const m of text.matchAll(LINK_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const href = m[2] ?? m[3]
    out.push(
      <a key={`${key}-${m.index}`} href={href} target="_blank" rel="noreferrer noopener" className="inline-link">
        {m[1] ?? href}
      </a>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
const rich = (text) =>
  text.split('`').map((chunk, i) =>
    i % 2 ? (
      <code key={i} className="inline-code">
        {chunk}
      </code>
    ) : (
      chunk.split('**').map((part, j) => (j % 2 ? <b key={`${i}-${j}`}>{linkify(part, `${i}-${j}`)}</b> : linkify(part, `${i}-${j}`)))
    ),
  )

function RunState({ event, compact = false }) {
  if (compact) {
    const label = event.state === 'running' ? '작업 중' : event.state === 'error' ? '실패' : '완료'
    return (
      <span className="run-state" aria-label={label} title={label}>
        {event.state === 'running' ? (
          <Loader size={14} className="spin" />
        ) : event.state === 'error' ? (
          <X size={15} className="fail" />
        ) : (
          <Check size={15} className="ok" />
        )}
      </span>
    )
  }
  if (event.state === 'running')
    return (
      <span className="run-state">
        <Loader size={14} className="spin" /> 작업 중
      </span>
    )
  if (event.state === 'error')
    return (
      <span className="run-state">
        <X size={15} className="fail" /> 실패
      </span>
    )
  return (
    <span className="run-state">
      <Check size={15} className="ok" /> {duration(event.started_at, event.ended_at)} 완료됨
    </span>
  )
}

// ───────── 도구 호출: 아이콘 + 한 줄 설명 ─────────
const TOOL_ICON = {
  run_command: SquareTerminal,
  start_process: SquareTerminal,
  fetch_url: Compass,
  write_file: FileText,
  read_file: FileSearch,
  list_files: FolderTree,
  get_preview_url: Globe,
  todo_write: ListTodo,
  'daytona.create': Box,
  'daytona.start': Box,
}
const basename = (p = '') => String(p).split('/').filter(Boolean).pop() ?? p
const parseArgs = (e) => {
  try {
    return JSON.parse(e.args || '{}')
  } catch {
    return {}
  }
}

function ToolLine({ event, selected, onSelect }) {
  const Icon = TOOL_ICON[event.tool] ?? SquareTerminal
  const isFile = event.tool === 'write_file'
  return (
    <button
      className={`tool-line ${isFile ? 'file' : ''} ${event.state} ${selected ? 'on' : ''}`}
      onClick={() => onSelect(event.id)}
      title={event.title}
    >
      <span className="tool-icon">
        <Icon size={14} />
      </span>
      <span className="tool-text">
        {isFile ? (
          <>
            파일 편집 <b>{basename(parseArgs(event).path)}</b>
          </>
        ) : (
          event.title
        )}
      </span>
      {event.state === 'running' && <Loader size={14} className="spin" aria-label="실행 중" />}
      {event.state === 'error' && <X size={14} className="fail" aria-label="실패" />}
    </button>
  )
}

// 연속된 도구 호출 묶음. 요약 줄을 누르면 접고 펼친다.
const COUNTS = [
  [['run_command', 'start_process'], (n) => `명령 ${n}회 실행`],
  [['fetch_url'], (n) => `페이지 ${n}개 열람`],
  [['read_file', 'list_files'], (n) => `파일 ${n}번 확인`],
  [['write_file'], (n) => `파일 ${n}개 편집`],
  [['get_preview_url'], () => '미리보기 링크 생성'],
  [['todo_write'], () => '할 일 목록 정리'],
  [['daytona.create', 'daytona.start'], () => '샌드박스 준비'],
]
const summarize = (events) =>
  COUNTS.map(([names, f]) => [events.filter((e) => names.includes(e.tool)).length, f])
    .filter(([n]) => n > 0)
    .map(([n, f]) => f(n))
    .join(' · ')

function ToolBlock({ events, selectedId, onSelect }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="tool-block">
      {/* 도구가 하나뿐이면 요약 줄이 같은 말을 반복하므로 생략한다 */}
      {events.length > 1 && (
        <button className="tool-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
          {summarize(events)}
          <ChevronDown size={14} className={`chev ${open ? 'open' : ''}`} />
        </button>
      )}
      {open && events.map((e) => <ToolLine key={e.id} event={e} selected={selectedId === e.id} onSelect={onSelect} />)}
    </div>
  )
}

// ───────── 하위 에이전트: 테두리 있는 카드 ─────────
function SubTools({ items, selectedId, onSelect }) {
  if (!items.length) return null
  return (
    <div className="agent-tools">
      {items.map((c) => (
        <ToolLine key={c.id} event={c} selected={selectedId === c.id} onSelect={onSelect} />
      ))}
    </div>
  )
}

// 하위 에이전트 하나. 펼치면 그 에이전트가 쓴 도구가 줄로 보인다.
function AgentCard({ event, items, selectedId, onSelect }) {
  const [open, setOpen] = useState(event.state === 'running')
  const selected = selectedId === event.id || items.some((c) => c.id === selectedId)
  return (
    <div className={`agent-card ${selected ? 'on' : ''}`}>
      <div className="agent-card-head">
        <button className="agent-main" onClick={() => onSelect(event.id)} title={event.title}>
          <GitBranch size={15} />
          <span className="run-title">{event.title}</span>
          <span className="agent-tag">{AGENTS[event.agent] ?? event.agent}</span>
          <RunState event={event} />
        </button>
        {items.length > 0 && (
          <button className="icon-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? '접기' : '펼치기'}>
            <ChevronDown size={15} className={`chev ${open ? 'open' : ''}`} />
          </button>
        )}
      </div>
      {open && <SubTools items={items} selectedId={selectedId} onSelect={onSelect} />}
    </div>
  )
}

// 동시에 실행된 하위 에이전트 여러 개. 고른 에이전트의 도구가 아래에 줄로 보인다.
function AgentGroup({ events, childrenOf, selectedId, onSelect }) {
  const finished = events.filter((e) => e.state !== 'running').length
  const running = finished < events.length
  const active = events.find((e) => e.id === selectedId || (childrenOf.get(e.id) ?? []).some((c) => c.id === selectedId))
  return (
    <div className={`agent-card ${active ? 'on' : ''}`}>
      <div className="agent-card-head">
        <div className="agent-main">
          <CircleDashed size={15} />
          <span className="run-title">하위 에이전트 {events.length}개 동시 실행</span>
          <span className="run-state">
            {running ? <Loader size={14} className="spin" /> : <Check size={15} className="ok" />} {finished} / {events.length}
          </span>
        </div>
      </div>
      <div className="group-grid">
        {events.map((e) => (
          <Run key={e.id} event={e} selected={active?.id === e.id} onSelect={onSelect} compact />
        ))}
      </div>
      {active && <SubTools items={childrenOf.get(active.id) ?? []} selectedId={selectedId} onSelect={onSelect} />}
    </div>
  )
}

// 턴 안의 기록을 화면 단위로 묶는다: 연속된 도구 → 하나의 목록, 연속된 위임 → 하나의 그룹.
function toBlocks(items) {
  const blocks = []
  for (const e of items) {
    const type = e.kind === 'tool' ? (e.tool === 'delegate_task' ? 'agents' : 'tools') : e.kind
    const last = blocks.at(-1)
    if ((type === 'tools' || type === 'agents') && last?.type === type) last.events.push(e)
    else blocks.push({ type, events: [e] })
  }
  return blocks
}

// 하위 에이전트 그리드 안의 작은 카드
function Run({ event, selected, onSelect, compact = false }) {
  return (
    <button className={`run ${selected ? 'on' : ''}`} onClick={() => onSelect(event.id)} title={event.title}>
      <GitBranch size={15} />
      <span className="run-title">{event.title}</span>
      <RunState event={event} compact={compact} />
    </button>
  )
}

function Computer({ event, tools, isLive, onSelect, onClose, task, runningDelegate }) {
  const index = event ? tools.findIndex((t) => t.id === event.id) : -1
  const isUrl = event?.tool === 'get_preview_url' && event.state === 'done' && /^https?:\/\//.test(event.output ?? '')
  const active = task.status === 'running' || task.status === 'queued'

  return (
    <aside className="computer">
      <div className="computer-card">
        <header className="computer-head">
          <span className="computer-tab">
            <Monitor size={15} />
            HOBBANG의 컴퓨터
            <button className="icon-btn" onClick={onClose} aria-label="패널 닫기" title="닫기">
              <X size={15} />
            </button>
          </span>
        </header>

        {!event ? (
          <p className="computer-empty">아직 실행한 도구가 없습니다.</p>
        ) : (
          <>
            <p className="computer-status">
              <span>
                {AGENTS[event.agent] ?? '에이전트'} {event.state === 'running' ? '실행 중' : '실행함'}
              </span>
              <span>
                {event.tool} 사용 · {event.title}
              </span>
            </p>

            <div className="call">
              <div className="call-head">
                <SquareTerminal size={16} />
                <b>{event.tool}</b>
                <code>tool.call</code>
              </div>
              {event.args && (
                <>
                  <p className="call-label">인수</p>
                  <pre>{event.args}</pre>
                </>
              )}
              <p className="call-label">{event.tool === 'delegate_task' ? '보고' : '출력'}</p>
              {isUrl ? (
                <a className="preview-link" href={event.output} target="_blank" rel="noreferrer">
                  미리보기 열기 <ExternalLink size={14} />
                </a>
              ) : (
                <pre>
                  {event.output || (event.state === 'running' ? '실행 중' : '(출력 없음)')}
                  {event.state === 'running' && <span className="caret" />}
                </pre>
              )}
            </div>
          </>
        )}

        <div className="scrubber">
          <button className="icon-btn" disabled={index <= 0} onClick={() => onSelect(tools[index - 1].id)} aria-label="이전 단계">
            <SkipBack size={15} />
          </button>
          <button
            className="icon-btn"
            disabled={index < 0 || index >= tools.length - 1}
            onClick={() => onSelect(tools[index + 1].id)}
            aria-label="다음 단계"
          >
            <SkipForward size={15} />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(tools.length - 1, 0)}
            value={Math.max(index, 0)}
            disabled={tools.length < 2}
            onChange={(e) => onSelect(tools[Number(e.target.value)].id)}
            aria-label="단계 이동"
          />
          <button className={`live ${isLive ? 'on' : ''}`} onClick={() => onSelect(null)} aria-pressed={isLive}>
            <i /> 실시간
          </button>
        </div>

        <footer className="computer-foot">
          <span className={`state state-${task.status}`}>
            <i /> {active ? '작업 중' : STATUS[task.status]}
          </span>
          {runningDelegate && (
            <button className="sub-link" onClick={() => onSelect(runningDelegate.id)}>
              <GitBranch size={14} />
              하위 에이전트 실행 중
              <ChevronRight size={14} />
            </button>
          )}
        </footer>
      </div>
    </aside>
  )
}

export default function TaskPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 1081px)').matches)
  const [selectedId, setSelectedId] = useState(null) // null = 실시간(최신 단계 따라가기)
  const [actionError, setActionError] = useState('')
  const [, setTick] = useState(0)
  const scrollRef = useRef(null)
  const stickToBottom = useRef(true)

  const load = useCallback(
    () =>
      api(`/tasks/${id}`)
        .then((d) => {
          setData(d)
          setError('')
        })
        .catch((e) => setError(e.message)),
    [id],
  )

  useEffect(() => {
    setData(null)
    setError('')
    setSelectedId(null)
    stickToBottom.current = true
    load()
  }, [load])

  const task = data?.task
  const active = task?.status === 'running' || task?.status === 'queued'

  // 실행 중에는 주기적으로 새 기록을 가져오고, 끝나면 사이드바 상태를 갱신한다.
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      load()
      setTick((n) => n + 1)
    }, POLL_MS)
    return () => {
      clearInterval(timer)
      notifyTasksChanged()
    }
  }, [active, load])

  // 맨 아래를 보고 있을 때만 새 기록으로 따라 내려간다.
  const eventCount = data?.events.length ?? 0
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [eventCount])
  const onScroll = (e) => {
    const el = e.currentTarget
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  if (error && !data) {
    return (
      <div className="page">
        <p className="empty">
          {error} <Link to="/" className="link">홈으로</Link>
        </p>
      </div>
    )
  }
  if (!data) return <div className="page"><p className="empty">불러오는 중…</p></div>

  const { events } = data
  const isOwner = task.user_id === user.id
  const childrenOf = new Map()
  for (const e of events) {
    if (e.parent_id) childrenOf.set(e.parent_id, [...(childrenOf.get(e.parent_id) ?? []), e])
  }
  const tools = events.filter((e) => e.kind === 'tool')
  const liveEvent = tools.findLast((e) => e.state === 'running') ?? tools.at(-1)
  const selected = (selectedId && tools.find((e) => e.id === selectedId)) || liveEvent
  const runningDelegate = tools.findLast((e) => e.tool === 'delegate_task' && e.state === 'running')

  // 사용자 메시지를 기준으로 턴을 나눈다.
  const turns = []
  for (const e of events) {
    if (e.kind === 'user') turns.push({ user: e, items: [], all: [] })
    else if (turns.length) {
      turns.at(-1).all.push(e)
      if (!e.parent_id) turns.at(-1).items.push(e)
    }
  }

  const select = (eventId) => {
    setSelectedId(eventId)
    setOpen(true)
  }

  const send = async ({ prompt }) => {
    setActionError('')
    try {
      await api(`/tasks/${task.id}/messages`, { method: 'POST', body: { text: prompt } })
      stickToBottom.current = true
      setSelectedId(null)
      await load()
      notifyTasksChanged()
      return true
    } catch (e) {
      setActionError(e.message)
      return false
    }
  }

  const stop = async () => {
    setActionError('')
    try {
      await api(`/tasks/${task.id}/stop`, { method: 'POST' })
      await load()
    } catch (e) {
      setActionError(e.message)
    }
  }

  return (
    <div className="task">
      <header className="task-head">
        <h1>{task.title}</h1>
        <StatusBadge status={task.status} />
        <span className="spacer" />
        <span className="task-meta">
          <Avatar name={task.author_name} size={22} />
          {task.author_name} · {task.model.split('/').pop()}
        </span>
        {!open && (
          <button className="reopen" onClick={() => setOpen(true)}>
            <Monitor size={14} />
            컴퓨터 보기
          </button>
        )}
      </header>

      <div className="task-body">
        <section className="chat">
          <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
            {turns.map((turn, ti) => {
              const last = ti === turns.length - 1
              const running = last && active
              const end = turn.all.at(-1)
              return (
                <div key={turn.user.id} className="turn">
                  <p className="bubble">{turn.user.title}</p>
                  {(turn.items.length > 0 || running) && (
                    <div className="agent-head">
                      <Logo size={22} />
                      <span className="elapsed">
                        {duration(turn.user.started_at, running ? null : end?.ended_at ?? end?.started_at)}{' '}
                        {running ? '동안 작업 중' : '동안 작업함'}
                      </span>
                    </div>
                  )}
                  {toBlocks(turn.items).map((b) => {
                    const e = b.events[0]
                    const sel = open ? selected?.id : null
                    if (b.type === 'text') return <p key={e.id} className="md-text">{rich(e.title)}</p>
                    if (b.type === 'error')
                      return (
                        <p key={e.id} className="status-line error">
                          <AlertCircle size={15} />
                          {e.title}
                        </p>
                      )
                    if (b.type === 'tools') return <ToolBlock key={e.id} events={b.events} selectedId={sel} onSelect={select} />
                    if (b.events.length === 1)
                      return <AgentCard key={e.id} event={e} items={childrenOf.get(e.id) ?? []} selectedId={sel} onSelect={select} />
                    return <AgentGroup key={e.id} events={b.events} childrenOf={childrenOf} selectedId={sel} onSelect={select} />
                  })}
                </div>
              )
            })}

            {active && (
              <p className="status-line">
                <Loader size={15} className="spin" />
                작업 중…
                {runningDelegate && (
                  <button className="sub-link" onClick={() => select(runningDelegate.id)}>
                    <GitBranch size={14} />
                    하위 에이전트 실행 중
                    <ChevronRight size={14} />
                  </button>
                )}
              </p>
            )}
            {task.status === 'stopped' && <p className="status-line">작업이 중지되었습니다.</p>}
          </div>

          <div className="chat-input">
            {actionError && (
              <p className="form-error" role="alert">
                {actionError}
              </p>
            )}
            {isOwner ? (
              <Composer
                compact
                showModel={false}
                busy={active}
                onStop={stop}
                onSubmit={send}
                placeholder={active ? '작업이 끝나면 이어서 지시할 수 있어요' : 'HOBBANG에게 이어서 지시하기'}
                disabled={active}
              />
            ) : (
              <p className="notice">{task.author_name}님의 작업이에요. 기록만 볼 수 있어요.</p>
            )}
          </div>
        </section>

        {open && (
          <Computer
            event={selected}
            tools={tools}
            isLive={selectedId === null}
            onSelect={setSelectedId}
            onClose={() => setOpen(false)}
            task={task}
            runningDelegate={runningDelegate}
          />
        )}
      </div>
    </div>
  )
}
