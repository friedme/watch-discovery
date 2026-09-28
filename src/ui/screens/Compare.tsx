import { useState } from 'react'
import { collectionLabel } from '../../domain/catalogue'
import type { Catalogue } from '../../domain/catalogue'
import type { Choice, SessionData, Watch } from '../../domain/types'
import { ThumbRow, TopBar, WatchDetail } from '../components'
import type { Route } from '../routing'

interface Props {
  catalogue: Catalogue
  sessions: SessionData[]
  a?: string
  b?: string
  navigate: (r: Route) => void
}

function reactions(session: SessionData | undefined): Map<string, Choice> {
  const map = new Map<string, Choice>()
  for (const v of session?.votes ?? []) if (!map.has(v.watchId)) map.set(v.watchId, v.choice)
  return map
}

/**
 * Side-by-side comparison of two people's reactions. Counts only — no
 * "compatibility" percentage.
 */
export function Compare({ catalogue, sessions, a, b, navigate }: Props) {
  const eligible = sessions.filter((s) => s.votes.length > 0)
  const [aId, setA] = useState(a ?? eligible[0]?.id)
  const [bId, setB] = useState(b ?? eligible.find((s) => s.id !== (a ?? eligible[0]?.id))?.id)
  const [detail, setDetail] = useState<Watch | null>(null)
  const A = eligible.find((s) => s.id === aId)
  const B = eligible.find((s) => s.id === bId)
  const nameA = A?.name || 'Person A'
  const nameB = B?.name || 'Person B'

  const groups = (() => {
    const ra = reactions(A)
    const rb = reactions(B)
    const pick = (test: (x?: Choice, y?: Choice) => boolean) => catalogue.watches.filter((w) => test(ra.get(w.id), rb.get(w.id)))
    const decisive = (c?: Choice) => c === 'yay' || c === 'nay'
    return {
      both: pick((x, y) => x === 'yay' && y === 'yay'),
      onlyA: pick((x, y) => x === 'yay' && y === 'nay'),
      onlyB: pick((x, y) => x === 'nay' && y === 'yay'),
      aNotSeenByB: pick((x, y) => x === 'yay' && !decisive(y)),
      bNotSeenByA: pick((x, y) => y === 'yay' && !decisive(x)),
      bothNay: pick((x, y) => x === 'nay' && y === 'nay'),
      shared: pick((x, y) => decisive(x) && decisive(y)).length,
    }
  })()

  if (eligible.length < 2) {
    return (
      <main className="screen narrow">
        <TopBar onBack={() => navigate({ name: 'home' })} title="Compare" />
        <p className="muted">
          Comparing needs two sessions on this device. Let a second person play here, or open a results link they copied
          on their phone.
        </p>
      </main>
    )
  }

  const agreed = groups.both.length + groups.bothNay.length
  const select = (value: string | undefined, set: (id: string) => void, exclude?: string) => (
    <select className="input" value={value} onChange={(e) => set(e.target.value)}>
      {eligible.map((s) => (
        <option key={s.id} value={s.id} disabled={s.id === exclude}>
          {(s.name || 'Unnamed') + ' · ' + collectionLabel(s.collection) + ` (${s.votes.length})`}
        </option>
      ))}
    </select>
  )

  return (
    <main className="screen results">
      <TopBar onBack={() => navigate({ name: 'home' })} title="Compare" />
      <div className="compare-pickers">
        {select(aId, setA, bId)}
        <span className="muted">and</span>
        {select(bId, setB, aId)}
      </div>
      <p className="lede">
        {nameA} and {nameB} both gave a Yay or Nay to {groups.shared} of the same watches and agreed on {agreed} of them.
      </p>

      <Group title={`Both said Yay (${groups.both.length})`} watches={groups.both} onOpen={setDetail} highlight />
      <Group title={`${nameA} Yay, ${nameB} Nay (${groups.onlyA.length})`} watches={groups.onlyA} onOpen={setDetail} />
      <Group title={`${nameB} Yay, ${nameA} Nay (${groups.onlyB.length})`} watches={groups.onlyB} onOpen={setDetail} />
      <Group title={`${nameA} liked, ${nameB} hasn't judged (${groups.aNotSeenByB.length})`} watches={groups.aNotSeenByB} onOpen={setDetail} />
      <Group title={`${nameB} liked, ${nameA} hasn't judged (${groups.bNotSeenByA.length})`} watches={groups.bNotSeenByA} onOpen={setDetail} />
      <Group title={`Both said Nay (${groups.bothNay.length})`} watches={groups.bothNay} onOpen={setDetail} />

      {detail && <WatchDetail watch={detail} onClose={() => setDetail(null)} />}
    </main>
  )
}

function Group({ title, watches, onOpen, highlight }: { title: string; watches: Watch[]; onOpen: (w: Watch) => void; highlight?: boolean }) {
  if (!watches.length) return null
  return (
    <section className={`section ${highlight ? 'highlight' : ''}`}>
      <h2 className="section-title">{title}</h2>
      {highlight ? (
        <div className="fav-grid">
          {watches.map((w) => (
            <button key={w.id} className="fav" onClick={() => onOpen(w)}>
              <img src={w.imageUrl} alt="" loading="lazy" />
              <span className="fav-name">{w.displayName}</span>
            </button>
          ))}
        </div>
      ) : (
        <ThumbRow watches={watches} onOpen={onOpen} max={40} />
      )}
    </section>
  )
}
