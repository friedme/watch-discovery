import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Choice, Watch } from '../domain/types'
import { featureLabels } from './util'

/** A watch photo shown whole ("contain") over a soft blurred copy of itself. */
export function WatchPhoto({ watch, eager = false, className = '' }: { watch: Watch; eager?: boolean; className?: string }) {
  const [loaded, setLoaded] = useState(false)
  const fit = watch.image.fit ?? 'contain'
  return (
    <div className={`photo ${loaded ? 'is-loaded' : ''} ${className}`}>
      {fit === 'contain' && <img className="photo-backdrop" src={watch.imageUrl} alt="" aria-hidden="true" />}
      <img
        className="photo-main"
        src={watch.imageUrl}
        alt="A watch — the name is revealed with your results"
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        style={{ objectFit: fit, objectPosition: watch.image.position }}
      />
    </div>
  )
}

export function Thumb({ watch, onOpen, badge }: { watch: Watch; onOpen?: (w: Watch) => void; badge?: ReactNode }) {
  return (
    <button type="button" className="thumb" onClick={() => onOpen?.(watch)} aria-label={`Show ${watch.displayName}`}>
      <img src={watch.imageUrl} alt="" loading="lazy" decoding="async" />
      {badge && <span className="thumb-badge">{badge}</span>}
    </button>
  )
}

export function ThumbRow({ watches, onOpen, max = 6 }: { watches: Watch[]; onOpen?: (w: Watch) => void; max?: number }) {
  const shown = watches.slice(0, max)
  return (
    <div className="thumb-row">
      {shown.map((w) => (
        <Thumb key={w.id} watch={w} onOpen={onOpen} />
      ))}
      {watches.length > shown.length && <span className="thumb-more">+{watches.length - shown.length}</span>}
    </div>
  )
}

const CHOICE_TEXT: Record<Choice, string> = { yay: 'You said Yay', nay: 'You said Nay', pass: 'You passed' }

export function WatchDetail({ watch, choice, onClose }: { watch: Watch; choice?: Choice; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const src = watch.image.source
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={watch.displayName} onClick={(e) => e.stopPropagation()}>
        <WatchPhoto watch={watch} eager className="detail-photo" />
        <div className="modal-body">
          <h2 className="modal-title">{watch.displayName}</h2>
          {watch.variant && watch.image.verification.identity !== 'brand-only' && <p className="muted small">{watch.variant}</p>}
          {choice && <p className={`choice-tag ${choice}`}>{CHOICE_TEXT[choice]}</p>}
          <ul className="chips">
            {featureLabels(watch).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="credit">
            Photo: {src.credit}
            {src.pageUrl.startsWith('http') && (
              <>
                {' · '}
                <a href={src.pageUrl} target="_blank" rel="noreferrer">
                  source
                </a>
              </>
            )}
          </p>
          <button ref={closeRef} className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export function TopBar({ onBack, title, right }: { onBack?: () => void; title?: ReactNode; right?: ReactNode }) {
  return (
    <div className="topbar">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <span />
      )}
      <div className="topbar-title">{title}</div>
      <div className="topbar-right">{right}</div>
    </div>
  )
}
