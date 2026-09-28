/**
 * Visual design vocabulary used to describe each photographed watch.
 *
 * Everything here describes what is visible in the photo — never price,
 * brand prestige, size on the wrist or buying intent. Labels are written for
 * someone with no watch knowledge ("face" rather than "dial").
 *
 * - `label`  short chip text ("Blue face")
 * - `phrase` completes "watches ___" ("watches with a blue face")
 * - `observable: false` values are never turned into observations
 *   (e.g. "no gems" is not an interesting thing to tell someone).
 */

export interface ValueDef {
  label: string
  phrase: string
  observable?: boolean
}

export interface AttributeDef {
  label: string
  /** Relative visual salience used by the similarity measure. */
  weight: number
  /** Multi-valued attributes hold a list (e.g. features); others exactly one value. */
  multi: boolean
  values: Record<string, ValueDef>
  /** Partial similarity between related values (symmetric, 0..1). */
  near?: Array<[string, string, number]>
}

export const TAXONOMY = {
  style: {
    label: 'Overall style',
    weight: 2,
    multi: false,
    values: {
      dress: { label: 'Dressy & slim', phrase: 'in a dressy, slim style' },
      minimalist: { label: 'Minimalist', phrase: 'with a minimalist design' },
      everyday: { label: 'Classic everyday', phrase: 'in a classic everyday style' },
      'sport-ring': { label: 'Sporty diver style', phrase: 'in a sporty diver style, with a ring of numbers around the face' },
      chronograph: { label: 'Sporty stopwatch style', phrase: 'in a sporty stopwatch style, with small dials inside the face' },
      pilot: { label: 'Pilot style', phrase: 'in a pilot style with big, clear numbers' },
      field: { label: 'Rugged & military', phrase: 'in a rugged, military style' },
      integrated: { label: 'Sleek sporty bracelet', phrase: 'with a sleek case that flows into the bracelet' },
      jewellery: { label: 'Jewellery-like', phrase: 'that look more like jewellery' },
      playful: { label: 'Playful & colourful', phrase: 'in a playful, colourful style' },
      digital: { label: 'Digital display', phrase: 'with a digital display' },
      smart: { label: 'Smartwatch', phrase: 'that are smartwatches' },
      sculptural: { label: 'Unusual & sculptural', phrase: 'with an unusual, sculptural design' },
    },
    near: [
      ['dress', 'minimalist', 0.5],
      ['dress', 'everyday', 0.5],
      ['minimalist', 'everyday', 0.5],
      ['dress', 'jewellery', 0.3],
      ['sport-ring', 'chronograph', 0.3],
      ['sport-ring', 'field', 0.3],
      ['field', 'pilot', 0.5],
      ['chronograph', 'pilot', 0.3],
      ['integrated', 'everyday', 0.3],
      ['integrated', 'sport-ring', 0.3],
      ['integrated', 'sculptural', 0.3],
      ['digital', 'smart', 0.5],
      ['playful', 'digital', 0.3],
      ['jewellery', 'sculptural', 0.3],
    ],
  },
  caseShape: {
    label: 'Case shape',
    weight: 1.5,
    multi: false,
    values: {
      round: { label: 'Round case', phrase: 'with a round case' },
      rectangular: { label: 'Rectangular case', phrase: 'with a rectangular case' },
      square: { label: 'Square case', phrase: 'with a square case' },
      cushion: { label: 'Cushion-shaped case', phrase: 'with a cushion- or barrel-shaped case' },
      octagon: { label: 'Octagonal case', phrase: 'with an octagonal case' },
      oval: { label: 'Oval case', phrase: 'with an oval case' },
      unusual: { label: 'Unusual case shape', phrase: 'with an unusual case shape' },
    },
    near: [
      ['rectangular', 'square', 0.5],
      ['square', 'cushion', 0.5],
      ['round', 'oval', 0.5],
      ['round', 'cushion', 0.3],
      ['cushion', 'octagon', 0.3],
      ['octagon', 'unusual', 0.3],
      ['oval', 'unusual', 0.3],
    ],
  },
  caseColour: {
    label: 'Case colour',
    weight: 1.5,
    multi: false,
    values: {
      silver: { label: 'Silver-coloured case', phrase: 'with a silver-coloured case' },
      gold: { label: 'Gold-coloured case', phrase: 'with a gold-coloured case' },
      rose: { label: 'Rose-gold case', phrase: 'with a rose-gold-coloured case' },
      'two-tone': { label: 'Silver & gold mix', phrase: 'mixing silver and gold colours' },
      black: { label: 'Black case', phrase: 'with a black case' },
      white: { label: 'White case', phrase: 'with a white case' },
      colour: { label: 'Brightly coloured case', phrase: 'with a brightly coloured case' },
    },
    near: [
      ['gold', 'rose', 0.5],
      ['gold', 'two-tone', 0.5],
      ['silver', 'two-tone', 0.5],
      ['rose', 'two-tone', 0.3],
      ['silver', 'white', 0.3],
      ['white', 'colour', 0.3],
    ],
  },
  dialColour: {
    label: 'Face colour',
    weight: 1.5,
    multi: false,
    values: {
      black: { label: 'Black face', phrase: 'with a black face' },
      white: { label: 'White or silver face', phrase: 'with a white or silver face' },
      blue: { label: 'Blue face', phrase: 'with a blue face' },
      green: { label: 'Green face', phrase: 'with a green face' },
      grey: { label: 'Grey face', phrase: 'with a grey face' },
      brown: { label: 'Brown face', phrase: 'with a brown face' },
      champagne: { label: 'Champagne or gold face', phrase: 'with a champagne or gold face' },
      pink: { label: 'Pink or purple face', phrase: 'with a pink or purple face' },
      warm: { label: 'Warm-coloured face', phrase: 'with a red, orange or yellow face' },
      pearl: { label: 'Mother-of-pearl face', phrase: 'with a mother-of-pearl face' },
      skeleton: { label: 'See-through face', phrase: 'with a see-through face' },
      screen: { label: 'Screen', phrase: 'with a screen instead of a face', observable: false },
    },
    near: [
      ['black', 'grey', 0.5],
      ['white', 'grey', 0.3],
      ['white', 'champagne', 0.5],
      ['white', 'pearl', 0.5],
      ['champagne', 'brown', 0.3],
      ['blue', 'green', 0.3],
      ['pink', 'warm', 0.3],
      ['pink', 'pearl', 0.3],
    ],
  },
  dialTexture: {
    label: 'Face texture',
    weight: 1,
    multi: false,
    values: {
      plain: { label: 'Smooth face', phrase: 'with a smooth face' },
      textured: { label: 'Textured face', phrase: 'with a textured or patterned face' },
    },
  },
  band: {
    label: 'Strap or bracelet',
    weight: 1.5,
    multi: false,
    values: {
      bracelet: { label: 'Metal bracelet', phrase: 'on a metal bracelet' },
      leather: { label: 'Leather strap', phrase: 'on a leather strap' },
      rubber: { label: 'Rubber strap', phrase: 'on a rubber strap' },
      fabric: { label: 'Fabric strap', phrase: 'on a fabric strap' },
      mesh: { label: 'Fine mesh bracelet', phrase: 'on a fine mesh bracelet' },
      chain: { label: 'Chain or bangle', phrase: 'on a jewellery-style chain or bangle' },
      resin: { label: 'Plastic strap', phrase: 'on a plastic strap' },
    },
    near: [
      ['bracelet', 'mesh', 0.5],
      ['bracelet', 'chain', 0.5],
      ['mesh', 'chain', 0.3],
      ['rubber', 'resin', 0.5],
      ['leather', 'fabric', 0.3],
    ],
  },
  heft: {
    label: 'Look',
    weight: 1,
    multi: false,
    values: {
      delicate: { label: 'Delicate look', phrase: 'that look delicate' },
      balanced: { label: 'Balanced look', phrase: 'with a balanced look' },
      bold: { label: 'Bold chunky look', phrase: 'that look bold and chunky' },
    },
    near: [
      ['delicate', 'balanced', 0.5],
      ['balanced', 'bold', 0.5],
    ],
  },
  busyness: {
    label: 'Face detail',
    weight: 1,
    multi: false,
    values: {
      clean: { label: 'Clean simple face', phrase: 'with a clean, simple face' },
      moderate: { label: 'Moderately detailed face', phrase: 'with a moderately detailed face' },
      busy: { label: 'Busy detailed face', phrase: 'with a busy, detailed face' },
    },
    near: [
      ['clean', 'moderate', 0.5],
      ['moderate', 'busy', 0.5],
    ],
  },
  markers: {
    label: 'Hour markers',
    weight: 0.75,
    multi: false,
    values: {
      sticks: { label: 'Simple line markers', phrase: 'with simple line markers' },
      arabic: { label: 'Numbers', phrase: 'with numbers on the face' },
      roman: { label: 'Roman numerals', phrase: 'with Roman numerals' },
      minimal: { label: 'Few or no markers', phrase: 'with few or no hour markers' },
      gems: { label: 'Gem markers', phrase: 'with gem-set hour markers' },
      digital: { label: 'Digital numbers', phrase: 'with digital numbers', observable: false },
    },
    near: [
      ['sticks', 'minimal', 0.5],
      ['arabic', 'roman', 0.3],
      ['gems', 'sticks', 0.3],
    ],
  },
  bezel: {
    label: 'Rim around the face',
    weight: 1,
    multi: false,
    values: {
      plain: { label: 'Plain rim', phrase: 'with a plain rim around the face' },
      numbered: { label: 'Ring of numbers', phrase: 'with a ring of numbers or markings around the face' },
      fluted: { label: 'Ridged rim', phrase: 'with a ridged (fluted) rim' },
      gems: { label: 'Gem-set rim', phrase: 'with a gem-set rim' },
      decorative: { label: 'Decorative rim', phrase: 'with a decorative rim (screws, engraving or colour)' },
    },
    near: [
      ['plain', 'decorative', 0.3],
      ['fluted', 'decorative', 0.5],
      ['gems', 'decorative', 0.3],
      ['numbered', 'decorative', 0.3],
    ],
  },
  era: {
    label: 'Feel',
    weight: 0.75,
    multi: false,
    values: {
      classic: { label: 'Classic vintage feel', phrase: 'with a classic, vintage-inspired feel' },
      modern: { label: 'Modern feel', phrase: 'with a modern feel' },
    },
  },
  sparkle: {
    label: 'Sparkle',
    weight: 1,
    multi: false,
    values: {
      none: { label: 'No gems', phrase: 'without gems', observable: false },
      some: { label: 'A little sparkle', phrase: 'with a little sparkle (a few gems)' },
      lots: { label: 'Lots of sparkle', phrase: 'with lots of sparkle' },
    },
    near: [['some', 'lots', 0.5]],
  },
  features: {
    label: 'Visible extras',
    weight: 0.5,
    multi: true,
    values: {
      date: { label: 'Date window', phrase: 'with a date window', observable: false },
      moon: { label: 'Moon display', phrase: 'with a moon display' },
      subdials: { label: 'Small sub-dials', phrase: 'with small sub-dials on the face' },
      open: { label: 'Visible mechanics', phrase: 'where you can see the mechanics' },
      gmt: { label: 'Second time-zone hand', phrase: 'with a second time-zone hand' },
    },
  },
} as const satisfies Record<string, AttributeDef>

export type AttributeKey = keyof typeof TAXONOMY
export type ValueOf<K extends AttributeKey> = keyof (typeof TAXONOMY)[K]['values'] & string

export const ATTRIBUTE_KEYS = Object.keys(TAXONOMY) as AttributeKey[]

/** Attribute values of one photographed watch. `features` may be empty. */
export type WatchAttributes = {
  [K in AttributeKey]: (typeof TAXONOMY)[K]['multi'] extends true ? ValueOf<K>[] : ValueOf<K>
}

export function attributeDef(key: AttributeKey): AttributeDef {
  return TAXONOMY[key] as AttributeDef
}

export function valueDef(key: AttributeKey, value: string): ValueDef | undefined {
  return attributeDef(key).values[value]
}

/** Stable identifier for one attribute value, e.g. "dialColour:blue". */
export function valueKey(key: AttributeKey, value: string): string {
  return `${key}:${value}`
}

export function parseValueKey(vk: string): { key: AttributeKey; value: string } {
  const i = vk.indexOf(':')
  return { key: vk.slice(0, i) as AttributeKey, value: vk.slice(i + 1) }
}

/** All value keys that describe a watch (one per single-valued attribute, one per feature). */
export function valueKeysOf(attrs: WatchAttributes): string[] {
  const keys: string[] = []
  for (const key of ATTRIBUTE_KEYS) {
    const v = attrs[key] as string | string[]
    if (Array.isArray(v)) for (const item of v) keys.push(valueKey(key, item))
    else keys.push(valueKey(key, v))
  }
  return keys
}

const nearCache = new Map<AttributeKey, Map<string, number>>()

export function nearness(key: AttributeKey, a: string, b: string): number {
  if (a === b) return 1
  let table = nearCache.get(key)
  if (!table) {
    table = new Map()
    for (const [x, y, s] of attributeDef(key).near ?? []) {
      table.set(`${x}|${y}`, s)
      table.set(`${y}|${x}`, s)
    }
    nearCache.set(key, table)
  }
  return table.get(`${a}|${b}`) ?? 0
}

/** Returns a list of problems with an attribute object (empty when valid). */
export function validateAttributes(attrs: unknown): string[] {
  const problems: string[] = []
  if (!attrs || typeof attrs !== 'object') return ['attributes missing']
  const record = attrs as Record<string, unknown>
  for (const key of ATTRIBUTE_KEYS) {
    const def = attributeDef(key)
    const v = record[key]
    if (def.multi) {
      if (!Array.isArray(v)) {
        problems.push(`${key}: expected a list`)
        continue
      }
      for (const item of v) if (!def.values[item as string]) problems.push(`${key}: unknown value "${String(item)}"`)
      if (new Set(v).size !== v.length) problems.push(`${key}: duplicate values`)
    } else if (typeof v !== 'string' || !def.values[v]) {
      problems.push(`${key}: unknown value "${String(v)}"`)
    }
  }
  for (const k of Object.keys(record)) {
    if (!(ATTRIBUTE_KEYS as string[]).includes(k)) problems.push(`unknown attribute "${k}"`)
  }
  return problems
}
