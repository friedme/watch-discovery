import { useState } from 'react'
import { COLLECTIONS, MIN_PLAYABLE, poolFor, referencesFor } from '../../domain/catalogue'
import { listName } from '../../domain/reference'
import type { Catalogue } from '../../domain/catalogue'
import type { CollectionId, SessionData } from '../../domain/types'
import { createSession } from '../../engine/session'
import { randomSeed } from '../../engine/rng'
import { TopBar } from '../components'
import { newSessionId } from '../useSessions'

export function Setup({ catalogue, onStart, onBack }: { catalogue: Catalogue; onStart: (s: SessionData) => void; onBack: () => void }) {
  const [name, setName] = useState('')
  const available = COLLECTIONS.map((c) => ({ ...c, count: poolFor(catalogue, c.id).length }))
  const firstReady = available.find((c) => c.count >= MIN_PLAYABLE)?.id
  const [collection, setCollection] = useState<CollectionId | undefined>(firstReady)
  const [reference, setReference] = useState<string>('')
  const references = collection ? referencesFor(catalogue, collection) : []
  const chosenReference = references.some((r) => r.id === reference) ? reference : ''

  const start = () => {
    if (!collection) return
    onStart(
      createSession({
        id: newSessionId(),
        name,
        collection,
        seed: randomSeed(),
        now: Date.now(),
        reference: chosenReference || undefined,
        demo: catalogue.demo,
      }),
    )
  }

  return (
    <main className="screen narrow">
      <TopBar onBack={onBack} />
      <h1 className="title">Before you start</h1>

      <label className="field">
        <span className="field-label">Who&rsquo;s looking?</span>
        <input
          className="input"
          value={name}
          maxLength={40}
          placeholder="Your first name (optional)"
          autoComplete="given-name"
          onChange={(e) => setName(e.target.value)}
        />
        <span className="muted small">Handy when more than one person uses this phone.</span>
      </label>

      <fieldset className="field">
        <legend className="field-label">What would you like to look at?</legend>
        <div className="choice-cards">
          {available.map((c) => {
            const disabled = c.count < MIN_PLAYABLE
            return (
              <label key={c.id} className={`choice-card ${collection === c.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}>
                <input
                  type="radio"
                  name="collection"
                  value={c.id}
                  checked={collection === c.id}
                  disabled={disabled}
                  onChange={() => setCollection(c.id)}
                />
                <span className="choice-card-title">{c.label}</span>
                <span className="muted small">{disabled ? `Not enough checked photos yet (${c.count})` : `${c.hint} · ${c.count} watches`}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {references.length > 0 && (
        <fieldset className="field">
          <legend className="field-label">Second round (optional)</legend>
          <div className="choice-cards">
            <label className={`choice-card ${!chosenReference ? 'selected' : ''}`}>
              <input type="radio" name="reference" checked={!chosenReference} onChange={() => setReference('')} />
              <span className="choice-card-title">No second round</span>
              <span className="muted small">Just the opening round, then free exploring</span>
            </label>
            {references.map((r) => (
              <label key={r.id} className={`choice-card ${chosenReference === r.id ? 'selected' : ''}`}>
                <input type="radio" name="reference" checked={chosenReference === r.id} onChange={() => setReference(r.id)} />
                <span className="choice-card-title">Include the watches from {listName(r)}</span>
                <span className="muted small">Shown after the opening round, without names and mixed with similar designs</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="how">
        <p>
          <b>Yay</b> — you like how it looks. <b>Nay</b> — you don&rsquo;t. <b>Pass</b> — no opinion; it doesn&rsquo;t count
          either way.
        </p>
        <p>
          Just go with your first reaction to the design. It&rsquo;s not about price, brand or whether you&rsquo;d buy it.
          You can always undo.
        </p>
      </div>

      <button className="btn primary big" disabled={!collection} onClick={start}>
        Show me the first watch
      </button>
    </main>
  )
}
