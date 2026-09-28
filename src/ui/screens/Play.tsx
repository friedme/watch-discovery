import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { engineFor } from '../../domain/catalogue'
import type { Catalogue } from '../../domain/catalogue'
import type { Choice, SessionData, Watch } from '../../domain/types'
import { nextPick } from '../../engine/selection'
import { applyAction, deriveScreen, ROUND_SIZE } from '../../engine/session'
import type { SessionAction } from '../../engine/session'
import { computeStats } from '../../engine/stats'
import { ThumbRow, TopBar, WatchPhoto } from '../components'
import type { Route } from '../routing'

const SWIPE_THRESHOLD = 90

interface Props {
  catalogue: Catalogue
  session: SessionData
  onChange: (id: string, change: (s: SessionData) => SessionData) => void
  navigate: (r: Route) => void
}

interface Ghost {
  watch: Watch
  choice: Choice
  dx: number
  key: number
}

export function Play({ catalogue, session, onChange, navigate }: Props) {
  const engine = useMemo(() => engineFor(catalogue, session.collection, session.seed), [catalogue, session.collection, session.seed])
  const screen = useMemo(() => deriveScreen(engine, session), [engine, session])
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  // The card most recently voted on — ignores a second tap before the next card renders.
  const lastVoted = useRef<string | null>(null)

  const act = useCallback((action: SessionAction) => onChange(session.id, (s) => applyAction(engine, s, action)), [engine, onChange, session.id])

  const flash = useCallback((text: string) => {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1400)
  }, [])

  const vote = useCallback(
    (choice: Choice, dx = 0) => {
      if (screen.kind !== 'vote') return
      const watch = screen.pick.watch
      if (lastVoted.current === watch.id) return
      lastVoted.current = watch.id
      setGhost({ watch, choice, dx, key: Date.now() })
      act({ type: 'vote', watchId: watch.id, choice, at: Date.now() })
    },
    [screen, act],
  )

  const undo = useCallback(() => {
    if (!session.votes.length) return
    lastVoted.current = null
    setGhost(null)
    act({ type: 'undo', at: Date.now() })
    flash('Undone')
  }, [session.votes.length, act, flash])

  // Keyboard: ← Nay, → Yay, ↓ Pass, Backspace / Z Undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const key = e.key.toLowerCase()
      if (key === 'arrowright' || key === 'y') vote('yay')
      else if (key === 'arrowleft' || key === 'n') vote('nay')
      else if (key === 'arrowdown' || key === 'p') vote('pass')
      else if (key === 'backspace' || key === 'z' || key === 'u') {
        e.preventDefault()
        undo()
      } else return
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [vote, undo])

  // Warm the cache with whichever card could come next.
  useEffect(() => {
    if (screen.kind !== 'vote') return
    const current = screen.pick.watch.id
    for (const choice of ['yay', 'nay', 'pass'] as Choice[]) {
      const next = nextPick(engine, [...session.votes, { watchId: current, choice, at: 0 }])
      if (next) new Image().src = next.watch.imageUrl
    }
  }, [engine, screen, session.votes])

  const stats = useMemo(() => computeStats(engine, session.votes), [engine, session.votes])
  const toResults = () => navigate({ name: 'results', id: session.id })
  const toHome = () => navigate({ name: 'home' })

  if (screen.kind === 'checkpoint' || screen.kind === 'finished') {
    const finished = screen.kind === 'finished'
    const heading = finished
      ? 'You have seen every watch'
      : screen.after === 'opening'
        ? 'Opening round done'
        : 'Another round done'
    return (
      <main className="screen narrow">
        <TopBar onBack={toHome} />
        <div className="checkpoint">
          <p className="eyebrow">{stats.seen.size} watches seen</p>
          <h1 className="title">{heading}</h1>
          <p className="tally">
            <span className="yay-text">{stats.yay} Yay</span> · <span className="nay-text">{stats.nay} Nay</span> ·{' '}
            <span className="muted">{stats.pass} Pass</span>
          </p>
          {stats.yays.length > 0 && <ThumbRow watches={[...stats.yays].reverse()} max={8} />}
          <button className="btn primary big" onClick={toResults}>
            See results
          </button>
          {!finished && (
            <>
              <button className="btn big" onClick={() => act({ type: 'continue', at: Date.now() })}>
                Keep exploring — {ROUND_SIZE} more
              </button>
              <p className="muted small">
                Next come more designs like the ones you liked (for each direction you liked, not just one), a few contrasts
                to tell similar designs apart, and the odd wildcard.
              </p>
            </>
          )}
          <button className="text-btn" onClick={undo}>
            Undo last reaction
          </button>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
    )
  }

  const { pick, progress } = screen
  const watch = pick.watch
  const label = progress.phase === 'opening' ? `Opening round · ${progress.index} of ${progress.total}` : `Exploring · ${progress.index} of ${progress.total}`
  const pct = (100 * (progress.index - 1)) / Math.max(progress.total, 1)

  return (
    <main className="play">
      <TopBar
        onBack={toHome}
        title={<span className="progress-label">{label}</span>}
        right={
          session.votes.length > 0 && (
            <button className="btn small-btn" onClick={toResults}>
              Results
            </button>
          )
        }
      />
      <div className="progress" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="stage">
        <SwipeCard key={watch.id} onSwipe={vote}>
          <WatchPhoto watch={watch} eager />
          {catalogue.demo && <span className="sketch-tag">Sketch</span>}
        </SwipeCard>
        {ghost && (
          <div
            key={ghost.key}
            className={`card ghost ghost-${ghost.choice}`}
            style={{ '--dx': ghost.dx } as CSSProperties}
            onAnimationEnd={() => setGhost(null)}
            aria-hidden="true"
          >
            <WatchPhoto watch={ghost.watch} eager />
          </div>
        )}
      </div>

      <p className="credit tiny">{catalogue.demo ? 'Demo sketch — not a real watch' : `Photo: ${watch.image.source.credit}`}</p>
      <p className="question">Do you like how it looks?</p>

      <div className="vote-bar">
        <button className="vote nay" onClick={() => vote('nay')} aria-label="Nay — I don't like how it looks">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
          <span>Nay</span>
        </button>
        <button className="vote pass" onClick={() => vote('pass')} aria-label="Pass — no opinion">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 12h12" />
          </svg>
          <span>Pass</span>
        </button>
        <button className="vote yay" onClick={() => vote('yay')} aria-label="Yay — I like how it looks">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
          </svg>
          <span>Yay</span>
        </button>
      </div>

      <div className="play-footer">
        <button className="text-btn" onClick={undo} disabled={!session.votes.length}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" transform="translate(0,-3)" />
          </svg>
          Undo
        </button>
        <span className="muted small">Pass doesn&rsquo;t count either way</span>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}

function SwipeCard({ onSwipe, children }: { onSwipe: (choice: Choice, dx: number) => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    if (s.horizontal === null && Math.hypot(mx, my) > 8) {
      s.horizontal = Math.abs(mx) > Math.abs(my)
      if (s.horizontal) e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (s.horizontal) setDx(mx)
  }
  const finish = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    start.current = null
    if (!cancelled && s.horizontal && Math.abs(dx) >= SWIPE_THRESHOLD) onSwipe(dx > 0 ? 'yay' : 'nay', dx)
    setDx(0)
  }

  const strength = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD)
  return (
    <div
      className={`card ${dx ? 'dragging' : ''}`}
      style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 22}deg)` : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
    >
      {children}
      <span className="stamp stamp-yay" style={{ opacity: dx > 0 ? strength : 0 }}>
        Yay
      </span>
      <span className="stamp stamp-nay" style={{ opacity: dx < 0 ? strength : 0 }}>
        Nay
      </span>
    </div>
  )
}
