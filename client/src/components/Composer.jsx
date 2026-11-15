import { ArrowUp, ChevronDown, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchModels } from '../api.js'

// 홈(큰 입력창, 모델 선택)과 작업 상세(compact, 이어서 지시) 양쪽에서 쓰는 입력창
export default function Composer({
  compact = false,
  showModel = true,
  placeholder = '작업을 맡기거나 무엇이든 물어보세요',
  value,
  onChange,
  onSubmit,
  busy = false,
  onStop,
  disabled = false,
}) {
  const [inner, setInner] = useState('')
  const [models, setModels] = useState([])
  const [model, setModel] = useState('')
  const text = value ?? inner
  const setText = onChange ?? setInner

  useEffect(() => {
    if (!showModel) return
    fetchModels()
      .then((list) => {
        setModels(list)
        setModel((m) => m || list[0]?.id || '')
      })
      .catch(() => {})
  }, [showModel])

  const canSend = text.trim() && !disabled && !busy && (!showModel || model)

  const submit = async () => {
    if (!canSend) return
    const ok = await onSubmit?.({ prompt: text.trim(), model })
    if (ok !== false) setText('')
  }

  return (
    <div className={`composer ${compact ? 'composer-compact' : ''}`}>
      <textarea
        rows={compact ? 1 : 3}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        maxLength={8000}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="composer-bar">
        {showModel && models.length > 1 && (
          <label className="model-select">
            <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="모델 선택">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
        )}
        <span className="spacer" />
        {busy && onStop ? (
          <button className="send stop" onClick={onStop} aria-label="작업 중지" title="작업 중지">
            <Square size={12} fill="currentColor" />
          </button>
        ) : (
          <button className="send" onClick={submit} disabled={!canSend} aria-label="보내기">
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
