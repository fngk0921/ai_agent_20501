export const STATUS = {
  queued: '대기',
  running: '실행 중',
  done: '완료',
  failed: '실패',
  stopped: '중지됨',
}

export const AGENTS = {
  orchestrator: '오케스트레이터',
  explore: '탐색가',
  librarian: '사서',
  oracle: '오라클',
  frontend: '프론트엔드',
}

// SQLite datetime('now')는 UTC 'YYYY-MM-DD HH:MM:SS' 형식이다.
export const parseDate = (s) => (s ? new Date(`${s.replace(' ', 'T')}Z`) : null)

export function timeAgo(s) {
  const d = parseDate(s)
  if (!d) return ''
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (sec < 60) return '방금 전'
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}일 전`
  return d.toLocaleDateString('ko-KR')
}

export function duration(from, to) {
  const a = parseDate(from)
  const b = to ? parseDate(to) : new Date()
  if (!a) return ''
  const sec = Math.max(0, Math.round((b - a) / 1000))
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`
}

export const formatDate = (s) => parseDate(s)?.toLocaleDateString('ko-KR') ?? ''
