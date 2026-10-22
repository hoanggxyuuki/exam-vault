import { clock, day, person, type CustodyItem, type CustodyProof } from './model'

const names = (us: string[]) => {
  const n = [...new Set(us)].map((u) => person(u).name)
  return n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
}

function LeakCheck({ proof }: { proof: CustodyProof }) {
  const { firstKey, heldBefore, refused, opened } = proof
  const author = person(proof.sealedBy).name
  const lead = firstKey
    ? `Before ${clock(firstKey.at)} on ${day(firstKey.at)}, nobody but ${author} could read this paper.`
    : heldBefore.length
      ? `${names(heldBefore)} already held the opening key before this sitting.`
      : `Nobody but ${author} can read this paper until the board signs a release.`
  return (
    <div className="leak-check" aria-label="Leak check">
      <p className="leak-kicker">Leak check</p>
      <p className="leak-lead">{lead}</p>
      <dl className="leak-facts">
        <div>
          <dt>Sealed</dt>
          <dd>{clock(proof.sealedAt)} · {author}, its author</dd>
        </div>
        <div>
          <dt>Could first be opened</dt>
          <dd>{firstKey ? `${clock(firstKey.at)} · ${person(firstKey.holder).name}, after ${names(firstKey.signers)} signed` : 'Not yet. No release has been signed.'}</dd>
        </div>
        <div>
          <dt>Refused attempts</dt>
          <dd>{refused.length ? `${refused.length} · ${names(refused.map((r) => r.who))}` : 'None'}</dd>
        </div>
        <div>
          <dt>Opened</dt>
          <dd>{opened.length ? `${clock(opened[0].at)} · ${names(opened.map((o) => o.who))}, watermarked` : 'Not yet'}</dd>
        </div>
      </dl>
      {firstKey && (
        <p className="leak-foot">A copy that surfaced before {clock(firstKey.at)} can only have come from {author}. There is no route to the paper that skips the board&apos;s signatures.</p>
      )}
    </div>
  )
}

export function CustodyLog({ items, code, proof }: { items: CustodyItem[]; code: string; proof: CustodyProof | null }) {
  return (
    <section className="custody" aria-label="Chain of custody">
      <div className="custody-head">
        <h2>Chain of custody</h2>
        <p>Everything that happened to {code}, from the app log and the signed change requests in TideCloak.</p>
      </div>
      {proof && <LeakCheck proof={proof} />}
      {items.length === 0 ? (
        <p className="empty">Nothing has happened to this paper yet.</p>
      ) : (
        <ol className="ledger">
          {items.map((it, i) => (
            <li key={`${it.at}-${i}`} className={`entry tone-${it.tone}`}>
              <time dateTime={new Date(it.at).toISOString()}>{clock(it.at)}</time>
              <span className="mark" aria-hidden="true">
                {it.actor ? person(it.actor).initials : ''}
              </span>
              <div>
                <p className="entry-text">{it.text}</p>
                {it.sub && <p className="entry-sub">{it.sub}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
