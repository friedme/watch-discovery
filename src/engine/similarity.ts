import { ATTRIBUTE_KEYS, attributeDef, nearness } from '../domain/taxonomy'
import type { WatchAttributes } from '../domain/taxonomy'

const TOTAL_WEIGHT = ATTRIBUTE_KEYS.reduce((sum, k) => sum + attributeDef(k).weight, 0)

/** Visual similarity of two watches in [0, 1], based only on their design attributes. */
export function attributeSimilarity(a: WatchAttributes, b: WatchAttributes): number {
  let score = 0
  for (const key of ATTRIBUTE_KEYS) {
    const def = attributeDef(key)
    const va = a[key] as string | string[]
    const vb = b[key] as string | string[]
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length === 0 && vb.length === 0) score += def.weight
      else {
        const setB = new Set(vb)
        const inter = va.filter((x) => setB.has(x)).length
        const union = new Set([...va, ...vb]).size
        score += def.weight * (inter / union)
      }
    } else {
      score += def.weight * nearness(key, va as string, vb as string)
    }
  }
  return score / TOTAL_WEIGHT
}

interface HasAttributes {
  id: string
  attributes: WatchAttributes
}

/** Memoised pairwise similarity over a fixed set of watches. */
export class SimilarityIndex {
  private readonly index = new Map<string, number>()
  private readonly matrix: Float64Array
  private readonly n: number

  constructor(items: HasAttributes[]) {
    this.n = items.length
    items.forEach((w, i) => this.index.set(w.id, i))
    this.matrix = new Float64Array(this.n * this.n)
    for (let i = 0; i < this.n; i++) {
      this.matrix[i * this.n + i] = 1
      for (let j = i + 1; j < this.n; j++) {
        const s = attributeSimilarity(items[i].attributes, items[j].attributes)
        this.matrix[i * this.n + j] = s
        this.matrix[j * this.n + i] = s
      }
    }
  }

  get(a: string, b: string): number {
    const i = this.index.get(a)
    const j = this.index.get(b)
    if (i === undefined || j === undefined) return 0
    return this.matrix[i * this.n + j]
  }

  has(id: string): boolean {
    return this.index.has(id)
  }
}
