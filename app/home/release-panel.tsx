'use client'

import { describeChangeRequest, type ChangeRequest, type Directory } from '@/lib/tide/governance'
import { clock, person, requesterOf, type AppEvent, type ExamRow } from './model'

interface Props {
  me: string
  exam: ExamRow
  isBoard: boolean
  dir?: Directory
  pending: ChangeRequest[]
  events: AppEvent[]
  busy: boolean
  onSign: (access: 'write' | 'read') => void
  onRelease: () => void
  onRevoke: () => void
  onSelf: () => void
  onApprove: (cr: ChangeRequest) => void
  onDeny: (cr: ChangeRequest) => void
  onSeat: (u: string) => void
}

function Seats({ cr, board }: { cr: ChangeRequest; board: string[] }) {
  const signed = new Set((cr.authorizers ?? []).map((a) => a.username))
  return (
    <ul className="seats" aria-label="Board signatures">
      {board.map((u) => (
        <li key={u} className={signed.has(u) ? 'signed' : ''}>
          <span className="wax" aria-hidden="true">
            {person(u).initials}
          </span>
          <span className="seat-name">{person(u).name.split(' ')[0]}</span>
          <span className="seat-state">{signed.has(u) ? 'Signed' : 'Not yet'}</span>
        </li>
      ))}
    </ul>
  )
}

export function ReleasePanel(p: Props) {
  const board = p.dir?.board ?? []
  const holders = p.dir?.keyHolders ?? []
  const name = (u: string) => person(u).name
  const unseated = ['examoffice', 'invigilator'].filter((u) => p.dir && !board.includes(u))

  return (
    <aside className="panel" aria-label="Release">
      <section className="panel-block">
        <h2>Who can open this paper</h2>
        <dl className="rules">
          <div>
            <dt>Seals it</dt>
            <dd>
              Head of Examinations
              {p.exam.hasWritePolicy ? (
                <span className="tick">Authorised</span>
              ) : p.isBoard ? (
                <button className="btn small" disabled={p.busy} onClick={() => p.onSign('write')}>
                  Authorise sealing
                </button>
              ) : (
                <span className="pending-word">Not authorised yet</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Opens it</dt>
            <dd>
              Chief Invigilator, once the board releases the key
              {p.exam.hasReadPolicy ? (
                <span className="tick">Authorised</span>
              ) : p.isBoard && p.exam.hasWritePolicy ? (
                <button className="btn small" disabled={p.busy} onClick={() => p.onSign('read')}>
                  Authorise opening
                </button>
              ) : (
                <span className="pending-word">Not authorised yet</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Holds the key</dt>
            <dd className={holders.length ? 'holder' : 'nobody'}>{holders.length ? holders.map(name).join(', ') : 'Nobody'}</dd>
          </div>
        </dl>
      </section>

      {p.isBoard ? (
        <>
          <section className="panel-block" id="signatures">
            <h2>Waiting for signatures</h2>
            {p.pending.length === 0 && <p className="empty">Nothing is waiting. Every change to the opening key starts here.</p>}
            {p.pending.map((cr) => {
              const have = cr.authorizationCount ?? 0
              const need = cr.threshold ?? 1
              const mine = (cr.authorizers ?? []).some((a) => a.username === p.me)
              const asker = requesterOf(cr, p.events, p.dir)
              return (
                <div className="req" key={cr.id}>
                  <p className="req-what">{describeChangeRequest(cr, p.dir, name)}</p>
                  <p className="req-meta">
                    {asker ? `Asked by ${name(asker)}` : 'Raised'} at {cr.createdAt ? clock(cr.createdAt) : ''}
                  </p>
                  <Seats cr={cr} board={board} />
                  <div className="req-foot">
                    <span className="req-count">
                      {have} of {need} signatures
                    </span>
                    <span className="req-actions">
                      {!mine && (
                        <button className="btn small approve" disabled={p.busy} onClick={() => p.onApprove(cr)}>
                          Approve
                        </button>
                      )}
                      <button className="btn small ghost danger" disabled={p.busy} onClick={() => p.onDeny(cr)}>
                        Deny
                      </button>
                    </span>
                  </div>
                </div>
              )
            })}
          </section>

          <section className="panel-block">
            <h2>Ask the board</h2>
            <div className="asks">
              <button className="btn" disabled={p.busy} onClick={p.onRelease}>
                Release to Chief Invigilator
              </button>
              <button className="btn ghost" disabled={p.busy} onClick={p.onRevoke}>
                Revoke after the exam
              </button>
              <button className="btn ghost danger" disabled={p.busy} onClick={p.onSelf}>
                Request the key for myself
              </button>
            </div>
            <p className="hint">
              Each request needs {Math.max(1, Math.floor(board.length * 0.7))} of the {board.length} board members to sign. Asking does not count as signing.
            </p>
          </section>

          {unseated.length > 0 && (
            <section className="panel-block">
              <h2>Board seats</h2>
              <div className="asks">
                {unseated.map((u) => (
                  <button key={u} className="btn ghost" disabled={p.busy} onClick={() => p.onSeat(u)}>
                    Seat {name(u)}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="panel-block">
          <h2>Exam board</h2>
          <p className="empty">You are not on the exam board, so you cannot ask for or sign a release.</p>
        </section>
      )}
    </aside>
  )
}
