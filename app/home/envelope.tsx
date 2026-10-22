'use client'

import { useRef } from 'react'
import { clock, day, person, sittingTime, watermark, type ExamRecord, type ExamRow, type OpenResult } from './model'

interface Props {
  exam: ExamRow
  record: ExamRecord | null
  canSeal: boolean
  draft: string
  onDraft: (v: string) => void
  onSeal: () => void
  onOpen: () => void
  onClose: () => void
  opened?: OpenResult
  busy: boolean
  view: 'paper' | 'server'
  onView: (v: 'paper' | 'server') => void
}

export function Flap() {
  return (
    <svg className="env-flap" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="0,0 100,0 50,100" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function SheetHead({ exam }: { exam: ExamRow }) {
  const at = sittingTime(exam.examAt)
  return (
    <header className="sheet-head">
      <p>Final examination, semester 2</p>
      <h2>
        {exam.code} {exam.title}
      </h2>
      <p>{at ? `${day(at.getTime())}, ${at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : exam.examAt}</p>
    </header>
  )
}

function ServerRecord({ record }: { record: ExamRecord | null }) {
  if (!record) return null
  const ct = record.paper?.ciphertext ?? ''
  const shown = {
    exam: { id: record.exam.id, code: record.exam.code, sitting: record.exam.examAt },
    paper: record.paper
      ? {
          sealedBy: record.paper.sealedBy,
          sealedAt: record.paper.sealedAt,
          ciphertext: ct.length > 760 ? `${ct.slice(0, 760)}... (${ct.length - 760} more characters)` : ct,
        }
      : null,
    policies: record.policies.map((p) => ({
      access: p.access,
      subject: `${p.subjectType}:${p.subjectId}`,
      signedBy: p.grantedBy,
      policy: `${p.policy.slice(0, 44)}... (signed, ${p.policy.length} characters)`,
    })),
    keys: 'none',
    plaintext: 'none',
  }
  return (
    <div className="server">
      <p className="server-intro">
        This is the complete record for {record.exam.code} on the app server. Anyone who breaches the server, or the IT administrator
        who runs it, gets exactly this and nothing more.
      </p>
      <pre className="server-json">{JSON.stringify(shown, null, 2)}</pre>
    </div>
  )
}

export function Envelope({ exam, record, canSeal, draft, onDraft, onSeal, onOpen, onClose, opened, busy, view, onView }: Props) {
  const sheet = useRef<HTMLElement>(null)
  const paper = record?.paper
  const sealer = person(exam.sealedBy ?? paper?.sealedBy ?? '').name
  const state = !exam.sealed ? (canSeal ? 'draft' : 'empty') : opened?.ok ? 'open' : 'sealed'

  const present = () => {
    const el = sheet.current
    if (el && document.fullscreenEnabled) el.requestFullscreen().catch(() => undefined)
  }

  return (
    <section className="paper-card" aria-label={`${exam.code} paper`}>
      <div className="seg" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === 'paper'} onClick={() => onView('paper')}>
          Paper
        </button>
        <button role="tab" aria-selected={view === 'server'} onClick={() => onView('server')}>
          What the server holds
        </button>
      </div>

      {view === 'server' ? (
        <ServerRecord record={record} />
      ) : state === 'draft' ? (
        <>
          <article className="sheet editing">
            <SheetHead exam={exam} />
            <textarea
              aria-label="Exam paper"
              placeholder="Type the questions here. They are encrypted in this browser when you seal the paper."
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
            />
          </article>
          <div className="paper-actions">
            <button className="btn seal-btn" disabled={busy || !draft.trim()} onClick={onSeal}>
              Seal paper
            </button>
            <p className="hint">Sealing encrypts the paper through the Tide network. You will not be able to read it back.</p>
          </div>
        </>
      ) : state === 'empty' ? (
        <div className="env env-empty">
          <Flap />
          <p className="env-wait">
            {exam.hasWritePolicy
              ? 'Waiting for the Head of Examinations to seal the paper.'
              : 'Waiting for the exam board to authorise who may seal this paper.'}
          </p>
        </div>
      ) : state === 'open' && opened ? (
        <>
          <article
            className="sheet released"
            ref={sheet}
            style={{ backgroundImage: watermark(`Released to ${opened.by}  ${day(opened.at)}  ${clock(opened.at)}`) }}
          >
            <SheetHead exam={exam} />
            <div className="sheet-body">{opened.text}</div>
            <footer className="sheet-foot">
              Released to {opened.by} by a quorum of the exam board. Opened at {clock(opened.at)}.
            </footer>
          </article>
          <div className="paper-actions">
            <button className="btn" onClick={present}>
              Present in exam room
            </button>
            <button className="btn ghost" onClick={onClose}>
              Close paper
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="env env-sealed">
            <div className="env-tint" aria-hidden="true">
              {(paper?.ciphertext ?? '').repeat(3)}
            </div>
            <Flap />
            <div className="env-seal" aria-hidden="true">
              <span>{exam.code}</span>
            </div>
            <div className="env-label">
              <p className="env-label-title">
                {exam.code} {exam.title}
              </p>
              <p>To be opened in the examination room by the Chief Invigilator only.</p>
            </div>
            <p className="env-stamp">
              Sealed by {sealer}
              {exam.sealedAt ? ` at ${clock(exam.sealedAt)}` : ''}
            </p>
          </div>
          {opened && !opened.ok && (
            <div className="refusal" role="alert">
              <p className="refusal-title">Refused by the Tide network</p>
              <p>{opened.text}</p>
              {opened.nodes && <p className="refusal-nodes">{opened.nodes}</p>}
              {opened.raw && (
                <details>
                  <summary>Technical detail</summary>
                  <code>{opened.raw.slice(0, 420)}</code>
                </details>
              )}
            </div>
          )}
          <div className="paper-actions">
            <button className="btn" disabled={busy || !exam.hasReadPolicy} onClick={onOpen}>
              Open paper
            </button>
            <p className="hint">
              {exam.hasReadPolicy
                ? 'The Tide network decides. It opens the paper only for someone the board has released it to.'
                : 'The board has not yet authorised who may open this paper.'}
            </p>
          </div>
        </>
      )}
    </section>
  )
}
