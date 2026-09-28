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
