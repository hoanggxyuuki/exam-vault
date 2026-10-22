import { changeRequestTarget, DECRYPT_ROLE, type ChangeRequest, type Directory } from '@/lib/tide/governance'

export const PEOPLE: Record<string, { name: string; title: string; initials: string }> = {
  admin: { name: 'Sam Vo', title: 'IT Administrator', initials: 'SV' },
  examoffice: { name: 'Hoa Nguyen', title: 'Head of Examinations', initials: 'HN' },
  invigilator: { name: 'Minh Pham', title: 'Chief Invigilator', initials: 'MP' },
}

export const person = (u?: string) =>
  (u && PEOPLE[u]) || { name: u || 'Someone', title: '', initials: (u || '?').slice(0, 2).toUpperCase() }

export interface ExamRow {
  id: string
  code: string
  title: string
  examAt: string
  createdAt: string
  sealed: boolean
  sealedBy: string | null
  sealedAt: string | null
  hasWritePolicy: boolean
  hasReadPolicy: boolean
}

export interface AppEvent {
  at: string
  actor: string
  action: string
  detail: string
}

export interface ExamRecord {
  exam: ExamRow
  paper: { ciphertext: string; sealedBy: string; sealedAt: string } | null
  policies: { access: 'read' | 'write'; subjectType: string; subjectId: string; grantedBy: string; createdAt: string; policy: string }[]
  events: AppEvent[]
}

export type Tone = 'ok' | 'bad' | 'warn' | 'info'
export type Note = { tone: Tone; text: string } | null

export interface OpenResult {
  ok: boolean
  text: string
  by: string
  at: number
  nodes?: string
  raw?: string
}

export function errorText(e: unknown): string {
  const seen = new Set<unknown>()
  const walk = (v: unknown): string => {
    if (v == null || seen.has(v)) return ''
    if (typeof v !== 'object') return String(v)
    seen.add(v)
    const o = v as Record<string, unknown>
    return Object.getOwnPropertyNames(o)
      .filter((k) => k !== 'stack')
      .map((k) => walk(o[k]))
      .join(' ')
  }
  return walk(e).replace(/\s+/g, ' ').trim()
}

export function explainRefusal(raw: string): { text: string; nodes?: string } {
  const m = raw.match(/got (\d+) of (\d+) required, (\d+) of (\d+) failed/)
  const nodes = m ? `${m[3]} of ${m[4]} Tide nodes refused` : undefined
  let text = raw.slice(0, 200)
  if (/_tide_decryptor'? role not found|role not found for this decryption/i.test(raw))
    text = 'You do not hold the opening key. The exam board has not released this paper to you.'
  else if (/role not found in doken/i.test(raw)) text = 'This paper opens only for the Chief Invigilator role, and you do not hold it.'
  else if (/_tide_decryptor not found in list of roles/i.test(raw)) text = 'This policy allows sealing only, not opening.'
  else if (/_tide_encryptor/i.test(raw)) text = 'You are not allowed to seal papers.'
  else if (/Tags do not contain/i.test(raw)) text = 'This ciphertext belongs to a different exam.'
  else if (/THRESHOLD|Could not reach enough/i.test(raw)) text = 'The Tide network refused the request.'
  return { text, nodes }
}

export function sittingTime(examAt: string): Date | null {
  const d = new Date(examAt.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

export function countdown(examAt: string, now: number): string {
  const d = sittingTime(examAt)
  if (!d) return examAt
  const mins = Math.round((d.getTime() - now) / 60000)
  const abs = Math.abs(mins)
  const span = abs >= 1440 ? `${Math.round(abs / 1440)} d` : abs >= 60 ? `${Math.floor(abs / 60)} h ${abs % 60} min` : `${abs} min`
  if (mins > 0) return `starts in ${span}`
  if (mins > -180) return `started ${span} ago`
  return 'finished'
}

export const clock = (t: number | string) =>
  new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const day = (t: number | string) =>
  new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export interface CustodyItem {
  at: number
  actor?: string
  tone: Tone | 'seal'
  text: string
  sub?: string
}

const isKeyChange = (c: ChangeRequest, dir?: Directory) =>
  /^(GRANT|REVOKE)_ROLES$/.test(c.actionType) && changeRequestTarget(c, dir).role === DECRYPT_ROLE

export function requesterOf(cr: ChangeRequest, events: AppEvent[], dir?: Directory): string | undefined {
  const { user } = changeRequestTarget(cr, dir)
  const kind = cr.actionType === 'REVOKE_ROLES' ? ['request-revoke'] : ['request-release', 'request-self']
  const t = Number(cr.createdAt ?? 0)
  return events
    .filter((e) => kind.includes(e.action) && e.detail === user && Math.abs(Date.parse(e.at) - t) < 120000)
    .sort((a, b) => Math.abs(Date.parse(a.at) - t) - Math.abs(Date.parse(b.at) - t))[0]?.actor
}

export function buildCustody(rec: ExamRecord, crs: ChangeRequest[], dir?: Directory): CustodyItem[] {
  const items: CustodyItem[] = []
  const since = Date.parse(rec.exam.createdAt) || 0
  for (const e of rec.events) {
    const at = Date.parse(e.at)
    const who = person(e.actor).name
    if (e.action === 'open-slot') items.push({ at, actor: e.actor, tone: 'info', text: `${who} opened the ${rec.exam.code} sitting` })
    else if (e.action === 'store-policy')
      items.push({
        at,
        actor: e.actor,
        tone: 'info',
        text: / write /.test(e.detail)
          ? `${who} authorised the Head of Examinations to seal the paper`
          : `${who} authorised the Chief Invigilator role to open it, once the board releases the key`,
        sub: 'Policy signed in the Tide enclave',
      })
    else if (e.action === 'seal') items.push({ at, actor: e.actor, tone: 'seal', text: `${who} sealed the paper`, sub: 'Encrypted in the browser. The server holds ciphertext only.' })
    else if (e.action === 'open-refused') items.push({ at, actor: e.actor, tone: 'bad', text: `${who} tried to open the paper and was refused`, sub: e.detail || undefined })
    else if (e.action === 'opened') items.push({ at, actor: e.actor, tone: 'ok', text: `${who} opened the paper`, sub: e.detail || undefined })
  }
  for (const cr of crs) {
    if (!isKeyChange(cr, dir)) continue
    const created = Number(cr.createdAt ?? 0)
    if (created < since) continue
    const { user } = changeRequestTarget(cr, dir)
    const target = person(user).name
    const grant = cr.actionType === 'GRANT_ROLES'
    const what = grant ? `give ${target} the opening key` : `take the opening key from ${target}`
    const asker = requesterOf(cr, rec.events, dir)
    const ask = asker && asker === user && grant ? 'asked the board for the opening key' : `asked the board to ${what}`
    items.push({ at: created, actor: asker, tone: 'warn', text: `${asker ? person(asker).name : 'A board member'} ${ask}`, sub: `Needs ${cr.threshold ?? 2} board signatures` })
    ;(cr.authorizers ?? []).forEach((a, i) => {
      if (!a.timestamp) return
      items.push({ at: a.timestamp, actor: a.username, tone: 'info', text: `${person(a.username).name} signed in the Tide enclave`, sub: `${i + 1} of ${cr.threshold ?? 2}: ${what}` })
    })
    if (cr.status === 'APPROVED' && cr.resolvedAt)
      items.push({ at: cr.resolvedAt, tone: 'ok', text: grant ? `Quorum reached. ${target} now holds the opening key` : `Quorum reached. ${target} no longer holds the opening key` })
    if (cr.status === 'DENIED' && cr.resolvedAt) {
      const by = cr.resolvedBy && dir ? dir.users[cr.resolvedBy] : undefined
      if (by) items.push({ at: cr.resolvedAt, actor: by, tone: 'bad', text: `${person(by).name} denied the request to ${what}` })
    }
  }
  return items.sort((a, b) => a.at - b.at)
}

export function watermark(text: string): string {
  const safe = text.replace(/[<>&'"]/g, '')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='460' height='240'><text x='20' y='150' transform='rotate(-22 230 120)' font-family='IBM Plex Sans, Arial, sans-serif' font-size='15' font-weight='600' fill='rgba(196,18,47,0.11)'>${safe}</text></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
