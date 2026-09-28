/** Demo mode (vector sketches instead of photos) is opt-in via ?demo in the URL. */
export function isDemoMode(search: string): boolean {
  return new URLSearchParams(search).has('demo')
}

/**
 * Built to run inside a page viewer (`npm run build:artifact`). Such viewers
 * drop URL query strings and fragments from the page's own link, so features
 * that depend on them (demo mode via ?demo, opening shared links) are offered
 * differently or not at all.
 */
export const EMBEDDED = import.meta.env.VITE_EMBEDDED === '1'
