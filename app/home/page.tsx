'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTideCloak } from '@tidecloak/nextjs'
import rawConfig from '../../tidecloak.json'
import { signRelationshipPolicy, encryptForRecord, decryptForRecord } from '@/lib/tide/relationship'
import {
  approveChangeRequest,
  BOARD_ROLE,
  changeRequestTarget,
  DECRYPT_ROLE,
  denyChangeRequest,
  describeChangeRequest,
  fetchAdminPolicy,
  listChangeRequests,
  loadDirectory,
  requestBoardSeat,
  requestRealmRole,
  type ChangeRequest,
  type Directory,
} from '@/lib/tide/governance'
import { buildCustody, countdown, custodyProof, day, errorText, explainRefusal, person, sittingTime, type ExamRecord, type ExamRow, type Note, type OpenResult } from './model'
import { Sidebar } from './sidebar'
import { Envelope } from './envelope'
import { ReleasePanel } from './release-panel'
import { CustodyLog } from './custody-log'

const tcConfig = rawConfig as unknown as Record<string, string>

export default function HomePage() {
  const router = useRouter()
  const { authenticated, isInitializing, logout, getToken, getValueFromIdToken, hasRealmRole, hasClientRole, forceRefreshToken } = useTideCloak()

  const [me, setMe] = useState('')
  const [exams, setExams] = useState<ExamRow[]>([])
  const [selected, setSelected] = useState('')
  const [record, setRecord] = useState<ExamRecord | null>(null)
  const [pending, setPending] = useState<ChangeRequest[]>([])
  const [decided, setDecided] = useState<ChangeRequest[]>([])
  const [dir, setDir] = useState<Directory | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<Note>(null)
  const [opened, setOpened] = useState<Record<string, OpenResult>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [view, setView] = useState<'paper' | 'server'>('paper')
  const [now, setNow] = useState(() => Date.now())

  const isBoard = hasClientRole(BOARD_ROLE, 'realm-management')
  const isSetter = hasRealmRole('lecturer')
  const isInvigilator = hasRealmRole('invigilator')
  const holdsKey = hasRealmRole(DECRYPT_ROLE)

  useEffect(() => {
    if (!isInitializing && !authenticated) router.push('/')
  }, [authenticated, isInitializing, router])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const token = await getToken()
      const res = await fetch(path, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      return body
    },
    [getToken],
  )

  const exam = exams.find((e) => e.id === selected) ?? exams[exams.length - 1]

  const refresh = useCallback(async () => {
    try {
      const list: ExamRow[] = await api('/api/exams')
      setExams(list)
      const current = list.find((e) => e.id === selected) ?? list[list.length - 1]
      if (current && current.id !== selected) setSelected(current.id)
      setRecord(current ? await api(`/api/exams/${current.id}`) : null)
      if (isBoard) {
        const token = (await getToken()) ?? ''
        const [d, p, a, n] = await Promise.all([
          loadDirectory(token),
          listChangeRequests(token, 'PENDING'),
          listChangeRequests(token, 'APPROVED'),
          listChangeRequests(token, 'DENIED'),
        ])
        setDir(d)
        setPending(p.sort((x, y) => Number(x.createdAt ?? 0) - Number(y.createdAt ?? 0)))
        setDecided([...a, ...n].filter((c) => changeRequestTarget(c, d).role === DECRYPT_ROLE))
      }
    } catch (e) {
      setNote({ tone: 'bad', text: errorText(e) })
    }
  }, [api, getToken, isBoard, selected])

  useEffect(() => {
    if (!authenticated) return
    setMe(String(getValueFromIdToken('preferred_username') ?? ''))
    refresh()
  }, [authenticated, getValueFromIdToken, refresh])

  const custody = useMemo(() => (record ? buildCustody(record, [...pending, ...decided], dir) : []), [record, pending, decided, dir])
  const proof = useMemo(() => (record ? custodyProof(record, [...pending, ...decided], dir) : null), [record, pending, decided, dir])

  if (!authenticated) return null

  const run = async (label: string, fn: () => Promise<Note | void>) => {
    setBusy(label)
    setNote(null)
    try {
      const n = await fn()
      if (n) setNote(n)
    } catch (e) {
      setNote({ tone: 'bad', text: errorText(e) })
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const log = (kind: string, detail = '') =>
    exam ? api(`/api/exams/${exam.id}/events`, { method: 'POST', body: JSON.stringify({ kind, detail }) }).catch(() => undefined) : Promise.resolve()

  const signPolicy = (access: 'write' | 'read') =>
    exam &&
    run(`sign-${access}`, async () => {
      const token = (await getToken()) ?? ''
      const adminPolicy = await fetchAdminPolicy(token)
      const subject = { type: 'Role' as const, id: access === 'write' ? 'lecturer' : 'invigilator' }
      const policy = await signRelationshipPolicy({ vendorId: tcConfig.vendorId, subject, recordId: exam.id, access }, adminPolicy)
      await api('/api/policies', { method: 'POST', body: JSON.stringify({ examId: exam.id, access, policy }) })
      return {
        tone: 'ok',
        text:
          access === 'write'
            ? 'Signed. The Head of Examinations may now seal this paper, without being able to read it back.'
            : 'Signed. The Chief Invigilator role may open this paper once the board releases the key.',
      }
    })

  const openSitting = (slot: { code: string; title: string; examAt: string }) =>
    run('sitting', async () => {
      const created = await api('/api/exams', { method: 'POST', body: JSON.stringify(slot) })
      setSelected(created.id)
      return { tone: 'ok', text: `${created.code} sitting opened. Next, authorise who may seal it and who may open it.` }
    })

  const seal = () =>
    exam &&
    run('seal', async () => {
      const text = (drafts[exam.id] ?? '').trim()
      if (!text) return { tone: 'warn', text: 'Write the paper before sealing it.' }
      const { policy } = await api(`/api/policies?examId=${exam.id}&access=write`)
      const ciphertext = await encryptForRecord(text, exam.id, policy)
      await api(`/api/exams/${exam.id}/paper`, { method: 'PUT', body: JSON.stringify({ ciphertext }) })
      setDrafts((d) => ({ ...d, [exam.id]: '' }))
      return { tone: 'ok', text: `${exam.code} sealed. The server now holds ciphertext only.` }
    })

  const open = () =>
    exam &&
    run('open', async () => {
      const paper = await api(`/api/exams/${exam.id}/paper`)
      const { policy } = await api(`/api/policies?examId=${exam.id}&access=read`)
      const by = person(me).name
      try {
        const text = await decryptForRecord(paper.ciphertext, exam.id, policy)
        setOpened((o) => ({ ...o, [exam.id]: { ok: true, text, by, at: Date.now() } }))
        await log('opened', 'Decrypted by the Tide network')
        return { tone: 'ok', text: `${exam.code} opened by the Tide network for ${by}.` }
      } catch (e) {
        const raw = errorText(e)
        const why = explainRefusal(raw)
        setOpened((o) => ({ ...o, [exam.id]: { ok: false, text: why.text, nodes: why.nodes, raw, by, at: Date.now() } }))
        await log('open-refused', why.nodes ?? why.text)
      }
    })

  const ask = (kind: 'request-release' | 'request-self' | 'request-revoke') =>
    run(kind, async () => {
      const token = (await getToken()) ?? ''
      const target = kind === 'request-self' ? me : 'invigilator'
      await requestRealmRole(token, target, DECRYPT_ROLE, kind === 'request-revoke')
      await log(kind, target)
      if (kind === 'request-self')
        return { tone: 'warn', text: 'You asked for the opening key yourself. The request is visible to the whole board, and they can deny it.' }
      if (kind === 'request-revoke') return { tone: 'info', text: 'Revocation requested. It takes effect once the board signs it.' }
      return { tone: 'info', text: 'Release to the Chief Invigilator requested. It takes effect once the board signs it.' }
    })

  const approve = (cr: ChangeRequest) =>
    run(`approve-${cr.id}`, async () => {
      const r = await approveChangeRequest((await getToken()) ?? '', cr.id)
      const what = describeChangeRequest(cr, dir, (u) => person(u).name)
      return r.committed
        ? { tone: 'ok', text: `Approved and committed. Quorum reached: ${what}.` }
        : { tone: 'info', text: `Your signature is recorded (${r.authCount ?? '?'} of ${r.threshold ?? '?'}). Waiting for another board member.` }
    })

  const deny = (cr: ChangeRequest) =>
    run(`deny-${cr.id}`, async () => {
      await denyChangeRequest((await getToken()) ?? '', cr.id, `Denied by ${person(me).name}`)
      return { tone: 'ok', text: `Denied: ${describeChangeRequest(cr, dir, (u) => person(u).name)}.` }
    })

  const seat = (u: string) =>
    run(`seat-${u}`, async () => {
      await requestBoardSeat((await getToken()) ?? '', u)
      return { tone: 'info', text: `Board seat for ${person(u).name} requested. It takes effect once the board signs it.` }
    })

  const refreshAccess = () =>
    run('access', async () => {
      await forceRefreshToken()
      return { tone: 'info', text: 'Access refreshed from TideCloak.' }
    })

  const caps = [isBoard && 'Exam board', isSetter && 'Seals papers', isInvigilator && 'Chief Invigilator', holdsKey && 'Holds the opening key'].filter(
    Boolean,
  ) as string[]

  const at = exam ? sittingTime(exam.examAt) : null

  return (
    <div className="shell">
      <Sidebar
        me={me}
        exams={exams}
        selected={exam?.id ?? ''}
        onSelect={(id) => {
          setSelected(id)
          setView('paper')
        }}
        pendingCount={pending.length}
        isBoard={isBoard}
        caps={caps}
        busy={!!busy}
        onOpenSitting={openSitting}
        onRefresh={refreshAccess}
        onSignOut={() => logout()}
      />

      <main className="main">
        {busy ? (
          <div className="toast tone-info" role="status">
            Working. If a Tide window opens, review and approve it there.
          </div>
        ) : note ? (
          <div className={`toast tone-${note.tone}`} role="status">
            {note.text}
          </div>
        ) : null}

        {!exam ? (
          <div className="blank">
            <h1>No sittings yet</h1>
            <p>{isBoard ? 'Open a sitting from the sidebar to start.' : 'The exam board has not opened a sitting yet.'}</p>
          </div>
        ) : (
          <>
            <header className="exam-head">
              <div>
                <p className="exam-code">{exam.code}</p>
                <h1>{exam.title}</h1>
              </div>
              <div className="exam-when">
                <p className="when-date">
                  {at ? `${day(at.getTime())}, ${at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : exam.examAt}
                </p>
                <p className="when-count">Sitting {countdown(exam.examAt, now)}</p>
              </div>
            </header>

            <div className="cols">
              <div className="col-main">
                <Envelope
                  exam={exam}
                  record={record?.exam.id === exam.id ? record : null}
                  canSeal={isSetter && exam.hasWritePolicy}
                  draft={drafts[exam.id] ?? ''}
                  onDraft={(v) => setDrafts((d) => ({ ...d, [exam.id]: v }))}
                  onSeal={seal}
                  onOpen={open}
                  onClose={() =>
                    setOpened((o) => {
                      const next = { ...o }
                      delete next[exam.id]
                      return next
                    })
                  }
                  opened={opened[exam.id]}
                  busy={!!busy}
                  view={view}
                  onView={setView}
                />
                <CustodyLog items={custody} code={exam.code} proof={record?.exam.id === exam.id ? proof : null} />
              </div>
              <ReleasePanel
                me={me}
                exam={exam}
                isBoard={isBoard}
                dir={dir}
                pending={pending}
                events={record?.events ?? []}
                busy={!!busy}
                onSign={signPolicy}
                onRelease={() => ask('request-release')}
                onRevoke={() => ask('request-revoke')}
                onSelf={() => ask('request-self')}
                onApprove={approve}
                onDeny={deny}
                onSeat={seat}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
