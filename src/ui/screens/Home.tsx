import { useState } from 'react'
import { collectionLabel, MIN_PLAYABLE, poolFor } from '../../domain/catalogue'
import type { Catalogue } from '../../domain/catalogue'
import type { SessionData } from '../../domain/types'
import { formatDate } from '../util'
import type { Route } from '../routing'
import type { SessionStore } from '../useSessions'

export function Home({ catalogue, store, navigate }: { catalogue: Catalogue; store: SessionStore; navigate: (r: Route) => void }) {
  const playable = Math.max(poolFor(catalogue, 'men').length, poolFor(catalogue, 'women').length)
  const ready = playable >= MIN_PLAYABLE
  const sessions = [...store.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
  const wanted = catalogue.entries.filter((e) => e.status === 'wanted').length

  return (
    <main className="screen narrow">
      <header className="hero">
        <p className="eyebrow">Watch Discovery</p>
        <h1 className="title">Which watch designs do you like?</h1>
        <p className="lede">
          One photo at a time. Tap <b>Yay</b> if you like how it looks, <b>Nay</b> if you don&rsquo;t, and <b>Pass</b> if
          you&rsquo;re not sure. No watch knowledge needed, no prices, and no brand names until the end.
        </p>
        {ready ? (
          <button className="btn primary big" onClick={() => navigate({ name: 'new' })}>
            Start
          </button>
        ) : (
          <div className="notice" role="status">
            <p>
              <b>No verified watch photos yet.</b> The app only shows photographs that have been checked against the
              watch they claim to show, with documented usage rights — never placeholders.
            </p>
            <p className="small muted">
              {wanted} watches are waiting for a photo. See <code>catalogue/MISSING_ASSETS.md</code> for the list and{' '}
              <code>catalogue/README.md</code> for how photos are added.
            </p>
            <a className="btn" href="?demo=1#/">
              Try the flow with demo sketches
            </a>
          </div>
        )}
      </header>

      {!store.persistent && (
        <p className="warning" role="alert">
          This browser isn&rsquo;t keeping data (private browsing?). Reactions will be lost when the tab closes.
        </p>
      )}

      {sessions.length > 0 && (
        <section className="section">
          <h2 className="section-title">On this device</h2>
          <ul className="session-list">
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} navigate={navigate} onDelete={() => store.remove(s.id)} />
            ))}
          </ul>
          {sessions.length >= 2 && (
            <button className="btn" onClick={() => navigate({ name: 'compare' })}>
              Compare two people
            </button>
          )}
        </section>
      )}

      <footer className="footer-links">
        <a href="#/about">How it works</a>
        <a href="#/credits">Photo credits</a>
        {catalogue.demo ? <a href="./#/">Leave demo</a> : ready && <a href="?demo=1#/">Demo sketches</a>}
      </footer>
    </main>
  )
}

function SessionRow({ session, navigate, onDelete }: { session: SessionData; navigate: (r: Route) => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const yays = session.votes.filter((v) => v.choice === 'yay').length
  return (
    <li className="session-row">
      <div className="session-info">
        <span className="session-name">{session.name || 'Unnamed'}</span>
        <span className="muted small">
          {collectionLabel(session.collection)} · {session.votes.length} seen · {yays} Yay · {formatDate(session.updatedAt)}
          {session.importedAt ? ' · shared with you' : ''}
        </span>
      </div>
      {confirming ? (
        <div className="row-actions">
          <button className="btn danger small-btn" onClick={onDelete}>
            Delete
          </button>
          <button className="btn small-btn" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      ) : (
        <div className="row-actions">
          {!session.importedAt && (
            <button className="btn small-btn" onClick={() => navigate({ name: 'play', id: session.id })}>
              Continue
            </button>
          )}
          <button className="btn small-btn" onClick={() => navigate({ name: 'results', id: session.id })} disabled={!session.votes.length}>
            Results
          </button>
          <button className="icon-btn" aria-label={`Delete ${session.name || 'session'}`} onClick={() => setConfirming(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 7h12M10 7V5h4v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </li>
  )
}
