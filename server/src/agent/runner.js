// 작업 실행기: 오케스트레이터 루프, 하위 에이전트 위임, 할 일 강제 진행, 실행 기록 저장
import { AGENT_MODELS, LIMITS } from '../config.js'
import db, { now } from '../db.js'
import { AGENTS, SUBAGENTS, todoReminder } from './agents.js'
import { chat } from './openai.js'
import { deleteSandboxById, ensureSandbox } from './sandbox.js'
import { clip, displayArgs, RUN, SCHEMAS, titleFor } from './tools.js'

const running = new Map() // taskId -> AbortController

// ───────── 실행 기록 저장 ─────────
async function addEvent(ctx, e) {
  if (ctx.signal.aborted) return null
  const { insertId } = await db.run(
    `INSERT INTO task_events (task_id, parent_id, kind, agent, title, tool, args, output, state, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ctx.taskId, e.parent_id ?? null, e.kind, e.agent ?? null, e.title ?? null, e.tool ?? null, e.args ?? null, e.output ?? null, e.state ?? 'done', now()],
  )
  return insertId
}

async function finishEvent(id, output, state = 'done') {
  if (id) await db.run('UPDATE task_events SET output = ?, state = ?, ended_at = ? WHERE id = ?', [clip(output, LIMITS.outputChars), state, now(), id])
}

const setStatus = (taskId, status) => db.run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [status, now(), taskId])

const failRunningEvents = (taskId) =>
  db.run(`UPDATE task_events SET state = 'error', ended_at = ? WHERE task_id = ? AND state = 'running'`, [now(), taskId])

// ───────── 공개 함수 ─────────
export const isRunning = (id) => running.has(Number(id))

export async function startTask(id) {
  const taskId = Number(id)
  if (running.has(taskId)) return
  const ac = new AbortController()
  running.set(taskId, ac)
  await setStatus(taskId, 'running')
  runTask(taskId, ac.signal)
    .catch((e) => console.error(`[task ${taskId}]`, e))
    .finally(() => running.delete(taskId))
}

export async function stopTask(id) {
  const taskId = Number(id)
  const ac = running.get(taskId)
  if (ac) {
    ac.abort()
    running.delete(taskId)
  }
  // 이 프로세스가 돌리고 있지 않더라도 DB에 실행 중으로 남아 있으면 중지로 정리한다.
  await db.run(`UPDATE tasks SET status = 'stopped', updated_at = ? WHERE id = ? AND status IN ('queued', 'running')`, [now(), taskId])
  await failRunningEvents(taskId)
}

export function deleteSandbox(sandboxId) {
  deleteSandboxById(sandboxId).catch((e) => console.warn(`[sandbox] ${sandboxId} 삭제 실패:`, e.message))
}

// ───────── 작업 실행 ─────────
async function runTask(taskId, signal) {
  const task = await db.get('SELECT id, model, sandbox_id FROM tasks WHERE id = ?', [taskId])
  if (!task) return
  const ctx = { taskId, signal, model: task.model, sandbox: null, todos: [] }

  try {
    const missing = ['OPENAI_API_KEY', 'DAYTONA_API_KEY'].filter((k) => !process.env[k])
    if (missing.length) throw new Error(`${missing.join(', ')}가 설정되지 않아 에이전트를 실행할 수 없습니다. server/.env를 확인해 주세요.`)

    // 이전 대화(사용자 메시지와 오케스트레이터 답변)를 이어 붙인다. 도구 기록은 넣지 않는다.
    const history = (
      await db.all(
        `SELECT kind, title FROM task_events
          WHERE task_id = ? AND parent_id IS NULL AND kind IN ('user', 'text') ORDER BY id`,
        [taskId],
      )
    ).map((e) => ({ role: e.kind === 'user' ? 'user' : 'assistant', content: e.title }))

    const prep = await addEvent(ctx, {
      kind: 'tool',
      agent: 'orchestrator',
      tool: task.sandbox_id ? 'daytona.start' : 'daytona.create',
      title: '샌드박스 준비',
      args: JSON.stringify({ sandbox_id: task.sandbox_id ?? null }, null, 2),
      state: 'running',
    })
    const { sandbox, note } = await ensureSandbox(task.sandbox_id)
    if (signal.aborted) return
    ctx.sandbox = sandbox
    if (sandbox.id !== task.sandbox_id) await db.run('UPDATE tasks SET sandbox_id = ? WHERE id = ?', [sandbox.id, taskId])
    await finishEvent(prep, note)

    if (history.length > 1) {
      const last = history[history.length - 1]
      last.content = `[시스템 알림] 위는 이 작업의 이전 대화입니다. ${note}. 아래 새 메시지에 이어서 진행하세요.\n\n${last.content}`
    }

    await agentLoop(ctx, 'orchestrator', history, null)
    if (!signal.aborted) await setStatus(taskId, 'done')
  } catch (e) {
    if (signal.aborted) return
    console.error(`[task ${taskId}]`, e)
    await failRunningEvents(taskId)
    await addEvent(ctx, { kind: 'error', title: e.message || '알 수 없는 오류가 발생했습니다.' })
    await setStatus(taskId, 'failed')
  }
}

// 모델 호출 → 도구 실행을 반복한다. 오케스트레이터와 하위 에이전트가 같이 쓴다.
async function agentLoop(ctx, agent, messages, parentId) {
  const def = AGENTS[agent]
  const model = agent === 'orchestrator' ? ctx.model : AGENT_MODELS[agent]
  const tools = def.tools.map((name) => SCHEMAS[name])
  const maxSteps = agent === 'orchestrator' ? LIMITS.orchestratorSteps : LIMITS.subagentSteps
  let reminders = 0
  let lastText = ''

  for (let step = 0; step < maxSteps; step++) {
    if (ctx.signal.aborted) throw new Error('중지됨')
    const msg = await chat({
      model,
      messages: [{ role: 'system', content: def.prompt }, ...messages],
      tools,
      signal: ctx.signal,
    })

    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : []
    const text = typeof msg.content === 'string' ? msg.content.trim() : ''
    // _items: Responses API의 원본 출력(추론, 함수 호출). 다음 호출에 그대로 돌려준다 (openai.js).
    messages.push({
      role: 'assistant',
      content: msg.content ?? '',
      ...(calls.length && { tool_calls: calls }),
      ...(msg._items && { _items: msg._items }),
    })

    if (text) {
      lastText = text
      if (agent === 'orchestrator') await addEvent(ctx, { kind: 'text', agent, title: text })
    }

    if (!calls.length) {
      // 할 일 강제 진행: 목록이 남았는데 멈추려 하면 다시 일하게 한다.
      const left = ctx.todos.filter((t) => t.status !== 'completed')
      if (agent === 'orchestrator' && left.length && reminders < LIMITS.todoReminders) {
        reminders++
        messages.push({ role: 'user', content: todoReminder(ctx.todos) })
        continue
      }
      return lastText
    }

    const results = await runCalls(ctx, agent, calls, parentId)
    for (const call of calls) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: results.get(call.id) })
    }
  }

  const limitNote = `단계 한도(${maxSteps}회)에 도달해 여기서 멈춥니다.`
  if (agent === 'orchestrator') await addEvent(ctx, { kind: 'text', agent, title: limitNote })
  return `${lastText}\n\n(${limitNote})`
}

// 일반 도구는 순서대로, 위임은 백그라운드처럼 동시에 실행한다 (최대 LIMITS.parallelSubagents개).
async function runCalls(ctx, agent, calls, parentId) {
  const results = new Map()
  const delegates = calls.filter((c) => c.function?.name === 'delegate_task')
  const others = calls.filter((c) => c.function?.name !== 'delegate_task')

  for (const call of others) results.set(call.id, await runTool(ctx, agent, call, parentId))

  const queue = [...delegates]
  const workers = Array.from({ length: Math.min(LIMITS.parallelSubagents, queue.length) }, async () => {
    while (queue.length) {
      const call = queue.shift()
      results.set(call.id, await runTool(ctx, agent, call, parentId))
    }
  })
  await Promise.all(workers)
  return results
}

async function runTool(ctx, agent, call, parentId) {
  const name = call.function?.name
  if (!AGENTS[agent].tools.includes(name)) return `오류: ${name} 도구는 사용할 수 없습니다.`

  let args
  try {
    args = JSON.parse(call.function.arguments || '{}')
  } catch {
    return '오류: 인수가 올바른 JSON이 아닙니다. 다시 시도하세요.'
  }

  const id = await addEvent(ctx, {
    kind: 'tool',
    parent_id: parentId,
    agent: name === 'delegate_task' && SUBAGENTS.includes(args.agent) ? args.agent : agent,
    tool: name,
    title: titleFor(name, args),
    args: displayArgs(name, args),
    state: 'running',
  })

  try {
    let output
    if (name === 'delegate_task') {
      if (!SUBAGENTS.includes(args.agent)) throw new Error(`알 수 없는 하위 에이전트: ${args.agent}`)
      output =
        (await agentLoop(ctx, args.agent, [{ role: 'user', content: String(args.prompt ?? '') }], id)) ||
        '(하위 에이전트가 보고를 남기지 않았습니다)'
    } else {
      output = await RUN[name](ctx, args)
    }
    await finishEvent(id, output, 'done')
    return clip(output, 12000)
  } catch (e) {
    if (ctx.signal.aborted) throw e
    await finishEvent(id, e.message, 'error')
    return `오류: ${e.message}`
  }
}
