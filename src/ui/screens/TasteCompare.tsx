import { useMemo, useState } from 'react'
import { collectionLabel, engineFor } from '../../domain/catalogue'
import type { Catalogue } from '../../domain/catalogue'
import { listName, possessive, STANCE_LABEL } from '../../domain/reference'
import type { ReferenceProfile } from '../../domain/reference'
import type { SessionData, Watch } from '../../domain/types'
import { buildProfile } from '../../engine/profile'
import { buildReferenceReport } from '../../engine/reference'
import type { ReferenceItem } from '../../engine/reference'
import { ThumbRow, TopBar, WatchDetail } from '../components'
import type { Route } from '../routing'

interface Props {
  catalogue: Catalogue
  session: SessionData
  profile: ReferenceProfile
  navigate: (r: Route) => void
}

/**
 * A declared taste (from someone's notes) next to another person's blind
 * reactions: where they agree, where they don't, and where the declared
 * taste could grow. Counts and actual watches only.
 */
export function TasteCompare({ catalogue, session, profile, navigate }: Props) {
  const engine = useMemo(
    () => engineFor(catalogue, session.collection, session.seed, session.reference),
    [catalogue, session.collection, session.seed, session.reference],
  )
  const report = useMemo(
    () => buildReferenceReport(engine, session.votes, profile, buildProfile(engine, session.votes).directions),
    [engine, session.votes, profile],
  )
  const [detail, setDetail] = useState<Watch | null>(null)
  const who = session.name || 'This person'
  const list = listName(profile)
  const owner = possessive(profile.owner)

  return (
    <main className="screen results">
      <TopBar onBack={() => navigate({ name: 'results', id: session.id })} title="Taste comparison" />
      <header className="results-head">
        <p className="eyebrow">{collectionLabel(session.collection)}</p>
        <h1 className="title">
          {who} and {list}
        </h1>
        <p className="lede">
          {report.listed} watches from the list can be shown in this collection. {who} gave a Yay or Nay to {report.reacted} of
          them, without seeing any names.
          {report.notAvailable > 0 && <span className="muted small"> {report.notAvailable} more on the list have no photo here yet.</span>}
        </p>
      </header>

      {report.reacted < 3 && (
        <p className="notice">
          Too few reactions to the listed watches to compare yet. Start a session with the second round switched on, or keep
          exploring.
        </p>
      )}

      <ItemSection title={`On the list, and ${who} said Yay`} items={report.agree} onOpen={setDetail} tone="yay" />
      <ItemSection title={`On the list, but ${who} said Nay`} items={report.differ} onOpen={setDetail} tone="nay" />
      <ItemSection title={`Maybes on the list: ${who.toLowerCase() === 'this person' ? 'their' : `${who}'s`} reactions`} items={report.maybes} onOpen={setDetail} showChoice />
      <ItemSection title={`Ruled out on the list, but ${who} said Yay`} items={report.ruledOutButLiked} onOpen={setDetail} tone="yay" />
      <ItemSection title={`Ruled out on the list, and ${who} said Nay too`} items={report.bothRuledOut} onOpen={setDetail} compact />

      {report.directions.some((d) => d.yay + d.nay > 0) && (
        <section className="section">
          <h2 className="section-title">The directions in {owner} notes</h2>
          {report.directions
            .filter((d) => d.yay + d.nay > 0)
            .map((d) => (
              <div className="direction" key={d.key}>
                <h3 className="direction-title">{d.title}</h3>
                <p className="small">
                  {who} said Yay to {d.yay} of the {d.yay + d.nay} shown.
                </p>
                <ThumbRow watches={d.items.filter((i) => i.choice === 'yay' || i.choice === 'nay').map((i) => i.watch)} onOpen={setDetail} max={10} />
              </div>
            ))}
        </section>
      )}

      {report.traits.length > 0 && (
        <section className="section">
          <h2 className="section-title">Traits the favourites on the list share</h2>
          <ul className="observations">
            {report.traits.map((t) => (
              <li key={`${t.key}:${t.value}`} className={`obs ${t.yay > t.nay ? 'obs-drawn' : t.nay > t.yay ? 'obs-less' : 'obs-mixed'}`}>
                <p>
                  <b>{t.label}</b>: {t.inList} of the {t.listSize} favourites on the list. {who} said Yay to {t.yay} of the {t.yay + t.nay}{' '}
                  watches with it.
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(report.adjacent.length > 0 || report.farDirections.length > 0) && (
        <section className="section">
          <h2 className="section-title">Where the taste could evolve</h2>
          {report.adjacent.length > 0 && (
            <>
              <p className="muted small">Not on the list, but close to a favourite on it, and {who} said Yay:</p>
              <ul className="recs">
                {report.adjacent.map((a) => (
                  <li key={a.watch.id} className="rec">
                    <button type="button" className="thumb" onClick={() => setDetail(a.watch)} aria-label={`Show ${a.watch.displayName}`}>
                      <img src={a.watch.imageUrl} alt="" loading="lazy" />
                    </button>
                    <div>
                      <p className="rec-name">{a.watch.displayName}</p>
                      <p className="small muted">
                        Close to the {a.closest.displayName} on the list{a.shared.length ? `: ${a.shared.join(', ')}` : ''}.
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {report.farDirections.map((d, i) => (
            <div className="direction" key={i}>
              <h3 className="direction-title">{d.title}</h3>
              <p className="small">
                A direction {who} likes ({d.members.length} watches) with nothing close to it on the list.
              </p>
              <ThumbRow watches={d.members} onOpen={setDetail} max={8} />
            </div>
          ))}
        </section>
      )}

      {report.unseen.length > 0 && (
        <p className="muted small">
          {report.unseen.length} watches on the list haven&rsquo;t been shown to {who} yet
          {session.reference ? '' : '. A session with the second round switched on covers them'}.
        </p>
      )}

      <section className="section caveats">
        <p>
          The list comes from {owner} notes. {who}&rsquo;s side comes from blind reactions to photos, so it is about the look,
          not about brand, price, or how a watch wears.
        </p>
      </section>

      {detail && <WatchDetail watch={detail} choice={session.votes.find((v) => v.watchId === detail.id)?.choice} onClose={() => setDetail(null)} />}
    </main>
  )
}

function ItemSection({
  title,
  items,
  onOpen,
  tone,
  showChoice,
  compact,
}: {
  title: string
  items: ReferenceItem[]
  onOpen: (w: Watch) => void
  tone?: 'yay' | 'nay'
  showChoice?: boolean
  compact?: boolean
}) {
  if (!items.length) return null
  if (compact) {
    return (
      <section className="section">
        <h2 className="section-title">
          {title} ({items.length})
        </h2>
        <ThumbRow watches={items.map((i) => i.watch)} onOpen={onOpen} max={20} />
      </section>
    )
  }
  return (
    <section className={`section ${tone === 'yay' ? 'highlight' : ''}`}>
      <h2 className="section-title">
        {title} ({items.length})
      </h2>
      <ul className="recs">
        {items.map((i) => (
          <li key={i.watch.id} className="rec">
            <button type="button" className="thumb" onClick={() => onOpen(i.watch)} aria-label={`Show ${i.watch.displayName}`}>
              <img src={i.watch.imageUrl} alt="" loading="lazy" />
            </button>
            <div>
              <p className="rec-name">
                {i.watch.displayName}
                <span className="tag">{STANCE_LABEL[i.stance]}</span>
                {showChoice && i.choice && <span className={`tag tag-${i.choice}`}>{i.choice === 'yay' ? 'Yay' : 'Nay'}</span>}
              </p>
              {i.note && <p className="small muted">{i.note}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
