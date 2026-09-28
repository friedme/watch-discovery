import { useEffect, useMemo, useState } from 'react'
import { isDemoMode } from './domain/mode'
import { demoCatalogue } from './demo/demoCatalogue'
import { realCatalogue } from './domain/catalogue'
import type { Catalogue } from './domain/catalogue'
import type { SessionData } from './domain/types'
import { decodeSession, importCodeFromHash } from './storage/share'
import { useRoute } from './ui/routing'
import { About } from './ui/screens/About'
import { Compare } from './ui/screens/Compare'
import { Credits } from './ui/screens/Credits'
import { Home } from './ui/screens/Home'
import { ImportPrompt } from './ui/screens/ImportPrompt'
import { Play } from './ui/screens/Play'
import { Results } from './ui/screens/Results'
import { Setup } from './ui/screens/Setup'
import { TasteCompare } from './ui/screens/TasteCompare'
import { newSessionId, useSessions } from './ui/useSessions'

export default function App({ catalogue: injected }: { catalogue?: Catalogue }) {
  const demo = injected ? injected.demo : isDemoMode(window.location.search)
  const catalogue = useMemo(() => injected ?? (demo ? demoCatalogue() : realCatalogue()), [injected, demo])
  const store = useSessions(demo)
  const [route, navigate] = useRoute()
  const [pendingImport, setPendingImport] = useState<SessionData | null>(() => {
    const code = importCodeFromHash(window.location.hash)
    return code ? decodeSession(code, newSessionId(), Date.now()) : null
  })

  useEffect(() => {
    // The shared results now live in state; drop them from the address bar.
    if (importCodeFromHash(window.location.hash)) window.history.replaceState(null, '', '#/')
  }, [])

  const session = 'id' in route ? store.sessions.find((s) => s.id === route.id) : undefined

  let screen: React.ReactNode
  switch (route.name) {
    case 'new':
      screen = (
        <Setup
          catalogue={catalogue}
          onStart={(s) => {
            store.upsert(s)
            navigate({ name: 'play', id: s.id }, true)
          }}
          onBack={() => navigate({ name: 'home' })}
        />
      )
      break
    case 'play':
      screen = session ? (
        <Play catalogue={catalogue} session={session} onChange={store.update} navigate={navigate} />
      ) : (
        <Missing onHome={() => navigate({ name: 'home' })} />
      )
      break
    case 'results':
      screen = session ? (
        <Results catalogue={catalogue} session={session} sessions={store.sessions} onChange={store.update} navigate={navigate} />
      ) : (
        <Missing onHome={() => navigate({ name: 'home' })} />
      )
      break
    case 'compare':
      screen = <Compare catalogue={catalogue} sessions={store.sessions} a={route.a} b={route.b} navigate={navigate} />
      break
    case 'taste': {
      const profile = catalogue.references.find((r) => r.id === route.profile)
      screen =
        session && profile ? (
          <TasteCompare catalogue={catalogue} session={session} profile={profile} navigate={navigate} />
        ) : (
          <Missing onHome={() => navigate({ name: 'home' })} />
        )
      break
    }
    case 'credits':
      screen = <Credits catalogue={catalogue} onBack={() => navigate({ name: 'home' })} />
      break
    case 'about':
      screen = <About onBack={() => navigate({ name: 'home' })} />
      break
    default:
      screen = <Home catalogue={catalogue} store={store} navigate={navigate} />
  }

  return (
    <div className="app">
      {catalogue.demo && (
        <div className="demo-banner" role="note">
          Demo mode: vector sketches, not real watches. Results here are only for trying the app.
        </div>
      )}
      {screen}
      {pendingImport && (
        <ImportPrompt
          session={pendingImport}
          onAccept={() => {
            store.upsert(pendingImport)
            setPendingImport(null)
            navigate({ name: 'results', id: pendingImport.id })
          }}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  )
}

function Missing({ onHome }: { onHome: () => void }) {
  return (
    <main className="screen narrow center">
      <h1 className="title">Not found</h1>
      <p className="muted">This session isn't stored on this device.</p>
      <button className="btn primary" onClick={onHome}>
        Go to start
      </button>
    </main>
  )
}
