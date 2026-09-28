import { ATTRIBUTE_KEYS, valueDef } from '../domain/taxonomy'
import type { Watch } from '../domain/types'

/** Plain-language list of what can be seen in the photo. */
export function featureLabels(watch: Watch): string[] {
  const labels: string[] = []
  for (const key of ATTRIBUTE_KEYS) {
    const v = watch.attributes[key] as string | string[]
    for (const item of Array.isArray(v) ? v : [v]) {
      const def = valueDef(key, item)
      if (def && def.observable !== false) labels.push(def.label)
    }
  }
  return labels
}

/**
 * The photo credit shown under a card while voting. Names stay hidden until
 * the results, so private product photos (whose credit is the brand) only say
 * what kind of photo it is; their source is on the credits page. Open-licence
 * credits name the photographer, which reveals nothing about the watch.
 */
export function votingCredit(watch: Watch, demo: boolean): string {
  if (demo) return 'Demo sketch — not a real watch'
  if (watch.image.usage === 'personal-use-only') return 'Product photo · private use'
  return `Photo: ${watch.image.source.credit}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for browsers that block the async clipboard (e.g. plain http on a LAN).
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    area.remove()
    return ok
  }
}

export function formatDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
