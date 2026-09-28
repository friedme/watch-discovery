import { collectionLabel } from '../domain/catalogue'
import type { SessionData } from '../domain/types'
import type { Profile } from '../engine/profile'

/** Plain-text summary for pasting into a message. */
export function resultsText(session: SessionData, profile: Profile): string {
  const { stats } = profile
  const who = session.name || 'My'
  const lines: string[] = []
  lines.push(`Watch Discovery — ${session.name ? `${who}'s` : who} results · ${collectionLabel(session.collection)}`)
  lines.push(`${stats.yay} Yay, ${stats.nay} Nay, ${stats.pass} Pass (passes don't count).`)
  lines.push('')
  lines.push('Favourites:')
  if (profile.favourites.length) for (const w of profile.favourites) lines.push(`• ${w.displayName}${variantSuffix(w.variant, w.image.verification.identity)}`)
  else lines.push('• (no Yays yet)')
  if (profile.directions.length) {
    lines.push('')
    lines.push('Taste directions:')
    for (const d of profile.directions) lines.push(`• ${d.title} — ${d.members.map((w) => w.displayName).join(', ')}`)
  }
  if (profile.observations.length) {
    lines.push('')
    lines.push(`What stood out (from ${stats.decisive} Yay/Nay reactions):`)
    for (const o of profile.observations) lines.push(`• ${o.text}${o.confoundText ? ` ${o.confoundText}` : ''}`)
  }
  if (profile.recommendations.length) {
    lines.push('')
    lines.push('Worth exploring next:')
    for (const r of profile.recommendations) lines.push(`• ${r.watch.displayName}${r.kind === 'wildcard' ? ' (wildcard)' : ''} — ${r.reason}`)
  }
  lines.push('')
  lines.push('Reactions to photos only — not about price, brand or how a watch sits on the wrist.')
  return lines.join('\n')
}

function variantSuffix(variant: string | undefined, identity: string): string {
  return variant && identity !== 'brand-only' ? ` (${variant})` : ''
}
