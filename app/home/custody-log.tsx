import { clock, person, type CustodyItem } from './model'

export function CustodyLog({ items, code }: { items: CustodyItem[]; code: string }) {
  return (
    <section className="custody" aria-label="Chain of custody">
      <div className="custody-head">
        <h2>Chain of custody</h2>
        <p>Everything that happened to {code}, from the app log and the signed change requests in TideCloak.</p>
      </div>
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
