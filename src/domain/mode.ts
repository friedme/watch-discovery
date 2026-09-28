/** Demo mode (vector sketches instead of photos) is opt-in via ?demo in the URL. */
export function isDemoMode(search: string): boolean {
  return new URLSearchParams(search).has('demo')
}
