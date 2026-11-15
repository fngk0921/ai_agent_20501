// OpenAI Responses API 클라이언트.
// gpt-6 계열은 Chat Completions에서 추론과 함수 도구를 함께 쓸 수 없어서 /v1/responses를 쓴다.
// 실행기(runner.js)는 Chat 형식 메시지를 쓰므로 여기서 Responses 형식으로 바꿔 주고받는다.
const URL = 'https://api.openai.com/v1/responses'

export class AgentError extends Error {}

// Chat 형식 도구 스키마 → Responses 형식
const toTool = (t) => ({
  type: 'function',
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters,
  strict: false,
})

// Chat 형식 메시지 → Responses의 instructions + input
function toInput(messages) {
  const instructions = []
  const input = []
  for (const m of messages) {
    if (m.role === 'system') instructions.push(m.content)
    else if (m.role === 'user') input.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant') {
      // 이전 응답의 원본 항목(추론, 함수 호출)을 그대로 돌려줘야 추론이 이어진다.
      if (m._items) input.push(...m._items)
      else if (m.content) input.push({ role: 'assistant', content: m.content })
    } else if (m.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: m.tool_call_id, output: String(m.content ?? '') })
    }
  }
  return { instructions: instructions.join('\n\n'), input }
}

// 반환: { content, tool_calls, _items } — runner.js가 쓰는 Chat 형식에 맞춘다.
export async function chat({ model, messages, tools, signal }) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new AgentError('OPENAI_API_KEY가 설정되지 않았습니다. server/.env를 확인해 주세요.')

  const { instructions, input } = toInput(messages)
  const body = {
    model,
    instructions,
    input,
    store: false, // 대화를 OpenAI에 저장하지 않는다. 대신 암호화된 추론 내용을 받아 다음 호출에 넘긴다.
    include: ['reasoning.encrypted_content'],
    ...(tools?.length && { tools: tools.map(toTool), tool_choice: 'auto', parallel_tool_calls: true }),
  }

  // 429, 5xx는 잠시 기다렸다가 두 번까지 다시 시도한다.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(URL, {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)

    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
      continue
    }
    if (!res.ok || data?.error) {
      const message = data?.error?.message || `HTTP ${res.status}`
      throw new AgentError(`모델 호출 실패 (${model}): ${message}`)
    }
    if (data.status === 'failed') throw new AgentError(`모델 응답 실패 (${model}): ${data.error?.message ?? '알 수 없음'}`)

    const items = Array.isArray(data.output) ? data.output : []
    const content = items
      .filter((i) => i.type === 'message')
      .flatMap((i) => i.content ?? [])
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text)
      .join('')
    const tool_calls = items
      .filter((i) => i.type === 'function_call')
      .map((i) => ({ id: i.call_id, type: 'function', function: { name: i.name, arguments: i.arguments } }))

    if (!content && !tool_calls.length && data.status === 'incomplete') {
      throw new AgentError(`모델 응답이 중간에 끊겼습니다 (${data.incomplete_details?.reason ?? '알 수 없음'}).`)
    }
    return { content, tool_calls, _items: items }
  }
}
