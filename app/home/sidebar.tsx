'use client'

import { useState } from 'react'
import { person, type ExamRow } from './model'

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <rect x="2.5" y="7.5" width="27" height="19" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 8.5 16 18 29 8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="18" r="5" fill="#c4122f" />
    </svg>
  )
}

interface Props {
  me: string
  exams: ExamRow[]
  selected: string
  onSelect: (id: string) => void
  pendingCount: number
  isBoard: boolean
  caps: string[]
  busy: boolean
  onOpenSitting: (slot: { code: string; title: string; examAt: string }) => void
  onRefresh: () => void
  onSignOut: () => void
}

const status = (e: ExamRow) => (e.sealed ? 'Sealed' : e.hasWritePolicy ? 'Awaiting paper' : 'Not authorised')

export function Sidebar(p: Props) {
  const me = person(p.me)
  const [slot, setSlot] = useState({ code: 'COSC2536', title: 'Security in Computing', examAt: '2026-10-22 13:30' })

  return (
    <nav className="side" aria-label="Exam Vault">
      <div className="side-brand">
        <Logo />
        <span>Exam Vault</span>
      </div>
      <p className="side-org">Exam office, synthetic demo</p>

      <h2 className="side-title">Sittings</h2>
      <ul className="sittings">
        {p.exams.map((e) => (
          <li key={e.id}>
            <button aria-current={e.id === p.selected ? 'page' : undefined} onClick={() => p.onSelect(e.id)}>
              <span className={`dot ${e.sealed ? 'sealed' : e.hasWritePolicy ? 'waiting' : 'new'}`} aria-hidden="true" />
              <span className="sitting-code">{e.code}</span>
              <span className="sitting-state">{status(e)}</span>
            </button>
          </li>
        ))}
        {p.exams.length === 0 && <li className="side-empty">No sittings yet.</li>}
      </ul>

      {p.isBoard && p.pendingCount > 0 && (
        <a className="side-pending" href="#signatures">
          <span>Waiting for signatures</span>
          <span className="count">{p.pendingCount}</span>
        </a>
      )}

      {p.isBoard && (
        <details className="new-sitting">
          <summary>Open a sitting</summary>
          <label>
            Course code
            <input value={slot.code} onChange={(e) => setSlot({ ...slot, code: e.target.value })} />
          </label>
          <label>
            Title
            <input value={slot.title} onChange={(e) => setSlot({ ...slot, title: e.target.value })} />
          </label>
          <label>
            Sitting
            <input value={slot.examAt} onChange={(e) => setSlot({ ...slot, examAt: e.target.value })} />
          </label>
          <button className="btn small light" disabled={p.busy} onClick={() => p.onOpenSitting(slot)}>
            Open sitting
          </button>
        </details>
      )}

      <div className="side-foot">
        <div className="persona">
          <span className="avatar" aria-hidden="true">
            {me.initials}
          </span>
          <div>
            <p className="name">{me.name}</p>
            <p className="title">{me.title}</p>
          </div>
        </div>
        {p.caps.length > 0 && (
          <ul className="caps" aria-label="Your access">
            {p.caps.map((c) => (
              <li key={c} className={c === 'Holds the opening key' ? 'key' : ''}>
                {c}
              </li>
            ))}
          </ul>
        )}
        <div className="side-actions">
          <button className="btn small light" disabled={p.busy} onClick={p.onRefresh}>
            Refresh access
          </button>
          <button className="btn small quiet" onClick={p.onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
