// 공용 기본 컴포넌트 모음: Button, Field, Avatar, StatusBadge, Modal, Logo
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { STATUS } from '../constants.js'

export function Logo({ size = 28 }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M12 7.2c-1.3-1.3 1.3-2.4 0-3.9M19.6 7.2c-1.3-1.3 1.3-2.4 0-3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4.5 21.5C4.5 14.6 9.6 10 16 10s11.5 4.6 11.5 11.5c0 2.4-1.7 4-4 4h-15c-2.3 0-4-1.6-4-4z" fill="currentColor" />
        <path d="M9.4 18.2c.9-2.3 2.7-3.8 5-4.3" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="logo-text">HOBBANG</span>
    </span>
  )
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  return <button className={`btn btn-${variant} btn-${size} ${className}`} {...props} />
}

export function Field({ label, hint, textarea, ...props }) {
  const Tag = textarea ? 'textarea' : 'input'
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <Tag className="input" {...props} />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

const AVATAR_COLORS = ['#e8ddd0', '#d9e3da', '#dbe1ea', '#eadbe0', '#e6e2d3']

export function Avatar({ name = '?', size = 28 }) {
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {name.slice(0, 1)}
    </span>
  )
}

export function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      <i />
      {STATUS[status]}
    </span>
  )
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}
