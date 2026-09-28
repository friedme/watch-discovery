import { useCallback, useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'play'; id: string }
  | { name: 'results'; id: string }
  | { name: 'compare'; a?: string; b?: string }
  | { name: 'credits' }
  | { name: 'about' }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  switch (parts[0]) {
    case 'new':
      return { name: 'new' }
    case 'play':
      return parts[1] ? { name: 'play', id: parts[1] } : { name: 'home' }
    case 'results':
      return parts[1] ? { name: 'results', id: parts[1] } : { name: 'home' }
    case 'compare':
      return { name: 'compare', a: parts[1], b: parts[2] }
    case 'credits':
      return { name: 'credits' }
    case 'about':
      return { name: 'about' }
    default:
      return { name: 'home' }
  }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'new':
      return '#/new'
    case 'play':
      return `#/play/${encodeURIComponent(route.id)}`
    case 'results':
      return `#/results/${encodeURIComponent(route.id)}`
    case 'compare':
      return ['#/compare', route.a, route.b].filter(Boolean).map((p, i) => (i ? encodeURIComponent(p!) : p)).join('/')
    case 'credits':
      return '#/credits'
    case 'about':
      return '#/about'
  }
}

export function useRoute(): [Route, (route: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    // Back/forward between pushState entries fires popstate; typed/linked hashes fire hashchange.
    window.addEventListener('hashchange', onChange)
    window.addEventListener('popstate', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
      window.removeEventListener('popstate', onChange)
    }
  }, [])
  const navigate = useCallback((next: Route, replace = false) => {
    const hash = routeToHash(next)
    if (replace) window.history.replaceState(null, '', hash)
    else if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    setRoute(next)
    window.scrollTo(0, 0)
  }, [])
  return [route, navigate]
}
