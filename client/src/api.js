// 서버 API 호출. 쿠키 세션을 쓰고, 실패하면 서버가 준 한국어 메시지로 오류를 던진다.
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', 0)
  }
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // 세션이 끝났으면 앱 전체에 알려 로그인 화면으로 보낸다.
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('auth:expired'))
    throw new ApiError(data?.error || `요청에 실패했습니다 (${res.status})`, res.status)
  }
  return data
}

// 작업 목록이 바뀌었음을 사이드바 등에 알린다.
export const notifyTasksChanged = () => window.dispatchEvent(new Event('tasks:changed'))

let modelsPromise
export function fetchModels() {
  modelsPromise ??= api('/models')
    .then((d) => d.models)
    .catch((e) => {
      modelsPromise = undefined
      throw e
    })
  return modelsPromise
}
