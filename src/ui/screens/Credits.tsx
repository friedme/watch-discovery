import type { Catalogue } from '../../domain/catalogue'
import { TopBar } from '../components'

export function Credits({ catalogue, onBack }: { catalogue: Catalogue; onBack: () => void }) {
  const waiting = catalogue.entries.filter((e) => e.status === 'wanted').length
  return (
    <main className="screen narrow">
      <TopBar onBack={onBack} title="Photo credits" />
      {catalogue.demo ? (
        <p className="muted">Demo mode uses generated vector sketches. They are not photographs of real watches.</p>
      ) : catalogue.watches.length === 0 ? (
        <p className="muted">No photos are in use yet.</p>
      ) : (
        <ul className="credits">
          {catalogue.watches.map((w) => (
            <li key={w.id}>
              <img src={w.imageUrl} alt="" loading="lazy" />
              <div>
                <p className="credit-name">{w.displayName}</p>
                <p className="small">
                  {w.image.source.author} ·{' '}
                  {w.image.source.licenseUrl ? (
                    <a href={w.image.source.licenseUrl} target="_blank" rel="noreferrer">
                      {w.image.source.license}
                    </a>
                  ) : (
                    w.image.source.license
                  )}{' '}
                  ·{' '}
                  <a href={w.image.source.pageUrl} target="_blank" rel="noreferrer">
                    source
                  </a>
                </p>
                {w.image.usage === 'personal-use-only' && <p className="small warning-text">Personal use only — replace before any public release.</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!catalogue.demo && waiting > 0 && (
        <p className="muted small">{waiting} further watches are waiting for a verified photo and are not shown anywhere.</p>
      )}
    </main>
  )
}
