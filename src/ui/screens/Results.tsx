import { useMemo, useState } from 'react'
import { collectionLabel, engineFor } from '../../domain/catalogue'
import type { Catalogue } from '../../domain/catalogue'
import type { SessionData, Watch } from '../../domain/types'
import { buildProfile } from '../../engine/profile'
import { applyAction, deriveScreen } from '../../engine/session'
import { shareLink } from '../../storage/share'
import { Thumb, ThumbRow, TopBar, WatchDetail } from '../components'
import { copyText } from '../util'
import { resultsText } from '../resultsText'
import type { Route } from '../routing'

interface Props {
  catalogue: Catalogue
  session: SessionData
  sessions: SessionData[]
  onChange: (id: string, change: (s: SessionData) => SessionData) => void
  navigate: (r: Route) => void
}

export function Results({ catalogue, session, sessions, onChange, navigate }: Props) {
  const engine = useMemo(() => engineFor(catalogue, session.collection, session.seed), [catalogue, session.collection, session.seed])
  const profile = useMemo(() => buildProfile(engine, session.votes), [engine, session.votes])
  const [detail, setDetail] = useState<Watch | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const { stats } = profile
  const choiceOf = (w: Watch) => stats.reactions.find((r) => r.watch.id === w.id)?.choice
  const screen = deriveScreen(engine, session)
  const canExplore = !session.importedAt && screen.kind !== 'finished'
  const possessive = session.name ? `${session.name}'s` : 'Your'

  const keepExploring = () => {
    if (screen.kind === 'checkpoint') onChange(session.id, (s) => applyAction(engine, s, { type: 'continue', at: Date.now() }))
    navigate({ name: 'play', id: session.id })
  }

  const copy = async (what: 'text' | 'link') => {
    const ok = await copyText(what === 'text' ? resultsText(session, profile) : shareLink(session, window.location))
    setCopied(ok ? (what === 'text' ? 'Summary copied' : 'Link copied') : 'Could not copy — try a different browser')
    window.setTimeout(() => setCopied(null), 2200)
  }

  const others = sessions.filter((s) => s.id !== session.id && s.votes.length > 0)

  return (
    <main className="screen results">
      <TopBar onBack={() => navigate({ name: 'home' })} title="Results" />
      <header className="results-head">
        <p className="eyebrow">
          {possessive} results · {collectionLabel(session.collection)}
        </p>
        <h1 className="title">What caught {session.name ? `${session.name}'s` : 'your'} eye</h1>
        <p className="tally">
          <span className="yay-text">{stats.yay} Yay</span> · <span className="nay-text">{stats.nay} Nay</span> ·{' '}
          <span className="muted">{stats.pass} Pass</span>
          <span className="muted small"> — passes don&rsquo;t count</span>
        </p>
      </header>

      <section className="section">
        <h2 className="section-title">Favourites</h2>
        {profile.favourites.length ? (
          <div className="fav-grid">
            {profile.favourites.map((w) => (
              <button key={w.id} className="fav" onClick={() => setDetail(w)}>
                <img src={w.imageUrl} alt="" loading="lazy" />
                <span className="fav-name">{w.displayName}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">No Yays yet.</p>
        )}
      </section>

      {(profile.directions.length > 0 || profile.oneOffs.length > 0) && (
        <section className="section">
          <h2 className="section-title">Taste directions</h2>
          <p className="muted small">
            Liked watches that look alike, grouped. Several directions at once is normal — nothing is averaged away.
          </p>
          {profile.directions.map((d, i) => (
            <div className="direction" key={i}>
              <h3 className="direction-title">{d.title}</h3>
              <p className="small">
                {d.members.length} watches {session.name || 'you'} liked share:{' '}
                {d.shared.slice(0, 5).map((s) => s.label.toLowerCase()).join(', ') || 'an overall resemblance'}.
              </p>
              <ThumbRow watches={d.members} onOpen={setDetail} max={8} />
            </div>
          ))}
          {profile.oneOffs.length > 0 && (
            <div className="direction">
              <h3 className="direction-title">Also liked</h3>
              <p className="small muted">Designs that don&rsquo;t (yet) sit in a group — each could be the start of another direction.</p>
              <ThumbRow watches={profile.oneOffs} onOpen={setDetail} max={8} />
            </div>
          )}
        </section>
      )}

      <section className="section">
        <h2 className="section-title">What stood out</h2>
        {profile.confidence === 'early' ? (
          <p className="muted">Patterns will appear here after a few more Yays and Nays.</p>
        ) : (
          <>
            <p className="muted small">
              Based on {stats.decisive} Yay/Nay reactions to photos
              {profile.confidence === 'tentative' ? ' — early days, so read these as hints' : ''}.
            </p>
            {profile.observations.length ? (
              <ul className="observations">
                {profile.observations.map((o) => (
                  <li key={`${o.key}:${o.value}`} className={`obs obs-${o.kind}`}>
                    <p>{o.text}</p>
                    {o.confoundText && <p className="muted small">{o.confoundText}</p>}
                    <ThumbRow watches={o.kind === 'less' ? o.dislikedExamples : o.likedExamples} onOpen={setDetail} max={6} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No single trait stands out yet — the reactions are spread across many kinds of design.</p>
            )}
          </>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">New designs worth exploring</h2>
        {profile.recommendations.length ? (
          <ul className="recs">
            {profile.recommendations.map((r) => (
              <li key={r.watch.id} className="rec">
                <Thumb watch={r.watch} onOpen={setDetail} />
                <div>
                  <p className="rec-name">
                    {r.watch.displayName}
                    {r.kind === 'wildcard' && <span className="tag">Wildcard</span>}
                  </p>
                  <p className="small muted">{r.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Every watch in this collection has been seen.</p>
        )}
        {canExplore && (
          <button className="btn primary" onClick={keepExploring}>
            Keep exploring
          </button>
        )}
      </section>

      {stats.nays.length > 0 && (
        <details className="section">
          <summary className="section-title">Not for {session.name || 'you'} ({stats.nays.length})</summary>
          <ThumbRow watches={stats.nays} onOpen={setDetail} max={40} />
        </details>
      )}
      {stats.passes.length > 0 && (
        <details className="section">
          <summary className="section-title">Passed ({stats.passes.length})</summary>
          <ThumbRow watches={stats.passes} onOpen={setDetail} max={40} />
        </details>
      )}

      <section className="section caveats">
        <p>
          These are reactions to photographs. Lighting and angle play a part, and size, weight and how a watch sits on the
          wrist can only be judged in person.
        </p>
        <p>Nothing here is about price or brand, and nothing is for sale.</p>
      </section>

      <section className="section actions">
        <button className="btn" onClick={() => copy('text')}>
          Copy summary
        </button>
        <button className="btn" onClick={() => copy('link')}>
          Copy link for another device
        </button>
        {others.length > 0 && (
          <button className="btn" onClick={() => navigate({ name: 'compare', a: session.id, b: others[0].id })}>
            Compare with {others[0].name || 'another session'}
          </button>
        )}
        <p className="muted small">
          The link contains these results; opening it on a phone that runs this app adds them there. Nothing is uploaded.
        </p>
      </section>

      {copied && <div className="toast">{copied}</div>}
      {detail && <WatchDetail watch={detail} choice={choiceOf(detail)} onClose={() => setDetail(null)} />}
    </main>
  )
}
