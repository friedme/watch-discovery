import type { WatchAttributes } from '../domain/taxonomy'

/**
 * Flat vector sketches drawn from design attributes. Demo mode only: they let
 * the flow be tried before real photographs exist and are always labelled as
 * sketches. They never represent a specific real watch.
 */

const W = 400
const H = 500
const CX = 200
const CY = 250

const CASE: Record<string, [string, string]> = {
  silver: ['#eef0f3', '#9ba3ab'],
  gold: ['#f7e2a4', '#b88a2e'],
  rose: ['#f6d2c3', '#b97b67'],
  'two-tone': ['#eef0f3', '#9ba3ab'],
  black: ['#4a4a4f', '#121214'],
  white: ['#ffffff', '#d7d7d7'],
  colour: ['#ff9a8b', '#e0445a'],
}

const DIAL: Record<string, string> = {
  black: '#15171b',
  white: '#f5f3ee',
  blue: '#1f3f7a',
  green: '#1e5a40',
  grey: '#5b6066',
  brown: '#5b3b27',
  champagne: '#dcc79e',
  pink: '#eaa9c2',
  warm: '#e2662b',
  pearl: 'url(#pearl)',
  skeleton: '#2a2622',
  screen: '#20242a',
}

const LIGHT_DIALS = new Set(['white', 'champagne', 'pink', 'pearl'])

export function sketchSvg(a: WatchAttributes): string {
  const scale = a.heft === 'delicate' ? 0.82 : a.heft === 'bold' ? 1.08 : 0.95
  const shape = caseGeometry(a.caseShape, scale)
  const [c1, c2] = CASE[a.caseColour] ?? CASE.silver
  const bezelMetal = a.caseColour === 'two-tone' ? CASE.gold : [c1, c2]
  const parts: string[] = []

  parts.push(`<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3efe8"/><stop offset="1" stop-color="#e4ded3"/></linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <linearGradient id="bezelMetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bezelMetal[0]}"/><stop offset="1" stop-color="${bezelMetal[1]}"/></linearGradient>
    <radialGradient id="pearl" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#fbf8f6"/><stop offset="0.5" stop-color="#e6ecf4"/><stop offset="1" stop-color="#f1e3ec"/></radialGradient>
    <pattern id="mesh" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${c2}"/><line x1="0" y1="0" x2="0" y2="6" stroke="${c1}" stroke-width="3"/></pattern>
  </defs>`)
  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`)
  parts.push(band(a, shape.bandWidth, shape.top, shape.bottom, c1, c2))
  parts.push(`<rect x="${shape.crownX}" y="${CY - 13}" width="16" height="26" rx="4" fill="url(#metal)" stroke="#0002"/>`)
  parts.push(shape.outline('url(#metal)', 0, 'stroke="#0003" stroke-width="2"'))

  const isScreen = a.dialColour === 'screen'
  const bezelInset = isScreen ? 14 : a.bezel === 'plain' ? 8 : 20
  if (!isScreen) parts.push(bezel(a, shape, bezelInset))
  parts.push(shape.outline(DIAL[a.dialColour] ?? DIAL.white, bezelInset + (a.bezel === 'plain' ? 0 : 4)))

  if (isScreen) parts.push(screen(a, shape.innerRadius))
  else {
    const ink = LIGHT_DIALS.has(a.dialColour) ? '#1d1d1f' : '#f4f1ea'
    const r = shape.innerRadius - bezelInset - 16
    if (a.dialColour === 'skeleton' || a.features.includes('open')) parts.push(gears(r))
    parts.push(markers(a.markers, r, ink))
    if (a.features.includes('subdials')) parts.push(subdials(r, ink, a.dialColour))
    if (a.features.includes('moon')) parts.push(moon(r))
    if (a.features.includes('date')) parts.push(`<rect x="${CX + r * 0.55}" y="${CY - 10}" width="26" height="20" rx="2" fill="#fff" stroke="#0004"/><text x="${CX + r * 0.55 + 13}" y="${CY + 5}" font-family="Helvetica,Arial" font-size="13" text-anchor="middle" fill="#222">14</text>`)
    parts.push(hands(r, ink, a))
  }
  if (a.sparkle !== 'none' && a.bezel !== 'gems') parts.push(sparkles(shape.innerRadius, a.sparkle === 'lots' ? 10 : 4))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`
}

export function sketchDataUri(a: WatchAttributes): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sketchSvg(a))}`
}

interface Geometry {
  outline: (fill: string, inset: number, extra?: string) => string
  innerRadius: number
  bandWidth: number
  top: number
  bottom: number
  crownX: number
}

function caseGeometry(shape: string, s: number): Geometry {
  const round = (r: number): Geometry => ({
    outline: (fill, inset, extra = '') => `<circle cx="${CX}" cy="${CY}" r="${r - inset}" fill="${fill}" ${extra}/>`,
    innerRadius: r,
    bandWidth: r * 1.15,
    top: CY - r * 0.8,
    bottom: CY + r * 0.8,
    crownX: CX + r - 4,
  })
  const rect = (w: number, h: number, rx: number): Geometry => ({
    outline: (fill, inset, extra = '') =>
      `<rect x="${CX - w / 2 + inset}" y="${CY - h / 2 + inset}" width="${w - 2 * inset}" height="${h - 2 * inset}" rx="${Math.max(2, rx - inset / 2)}" fill="${fill}" ${extra}/>`,
    innerRadius: Math.min(w, h) / 2,
    bandWidth: w * 0.78,
    top: CY - h / 2 + 10,
    bottom: CY + h / 2 - 10,
    crownX: CX + w / 2 - 4,
  })
  switch (shape) {
    case 'rectangular':
      return rect(150 * s, 196 * s, 18)
    case 'square':
      return rect(188 * s, 188 * s, 24)
    case 'cushion':
      return rect(206 * s, 206 * s, 64)
    case 'oval': {
      const rx = 92 * s
      const ry = 122 * s
      return {
        outline: (fill, inset, extra = '') => `<ellipse cx="${CX}" cy="${CY}" rx="${rx - inset}" ry="${ry - inset}" fill="${fill}" ${extra}/>`,
        innerRadius: rx,
        bandWidth: rx * 1.2,
        top: CY - ry + 12,
        bottom: CY + ry - 12,
        crownX: CX + rx - 4,
      }
    }
    case 'octagon': {
      const r = 116 * s
      const pts = (inset: number) =>
        Array.from({ length: 8 }, (_, i) => {
          const ang = Math.PI / 8 + (i * Math.PI) / 4
          return `${(CX + (r - inset) * Math.cos(ang)).toFixed(1)},${(CY + (r - inset) * Math.sin(ang)).toFixed(1)}`
        }).join(' ')
      return {
        outline: (fill, inset, extra = '') => `<polygon points="${pts(inset)}" fill="${fill}" ${extra}/>`,
        innerRadius: r * 0.92,
        bandWidth: r * 1.2,
        top: CY - r * 0.8,
        bottom: CY + r * 0.8,
        crownX: CX + r * 0.92 - 4,
      }
    }
    case 'unusual': {
      const r = 118 * s
      const path = (inset: number) => {
        const k = r - inset
        return `M ${CX - k} ${CY - k * 0.75} Q ${CX} ${CY - k * 1.05} ${CX + k} ${CY - k * 0.75} Q ${CX + k * 0.9} ${CY + k * 0.4} ${CX} ${CY + k} Q ${CX - k * 0.9} ${CY + k * 0.4} ${CX - k} ${CY - k * 0.75} Z`
      }
      return {
        outline: (fill, inset, extra = '') => `<path d="${path(inset)}" fill="${fill}" ${extra}/>`,
        innerRadius: r * 0.85,
        bandWidth: r * 1.1,
        top: CY - r * 0.8,
        bottom: CY + r * 0.7,
        crownX: CX + r * 0.85,
      }
    }
    default:
      return round(106 * s)
  }
}

function band(a: WatchAttributes, width: number, top: number, bottom: number, c1: string, c2: string): string {
  const x = CX - width / 2
  const pieces = [`<rect x="${x}" y="0" width="${width}" height="${top}"`, `<rect x="${x}" y="${bottom}" width="${width}" height="${H - bottom}"`]
  const solid = (fill: string, extra = '') => pieces.map((p) => `${p} fill="${fill}" ${extra}/>`).join('')
  switch (a.band) {
    case 'leather': {
      const stitch = [x + 8, x + width - 8]
        .map((sx) => `<line x1="${sx}" y1="0" x2="${sx}" y2="${top}" stroke="#e8d9c4" stroke-width="1.5" stroke-dasharray="6 5"/><line x1="${sx}" y1="${bottom}" x2="${sx}" y2="${H}" stroke="#e8d9c4" stroke-width="1.5" stroke-dasharray="6 5"/>`)
        .join('')
      return solid(a.caseColour === 'black' ? '#1d1d1f' : '#6b4630') + stitch
    }
    case 'rubber':
      return solid('#1f2124') + grooves(x, width, top, bottom, '#ffffff14')
    case 'resin':
      return solid(a.caseColour === 'colour' ? '#ff7a8a' : '#222326') + grooves(x, width, top, bottom, '#ffffff18')
    case 'fabric': {
      // Stripes run behind the case, which is drawn on top.
      const stripes = [0.15, 0.5, 0.85]
        .map((f) => `<rect x="${x + width * f - 5}" y="0" width="10" height="${H}" fill="#c9b98f" opacity="0.8"/>`)
        .join('')
      return solid('#4b5a3a') + stripes
    }
    case 'mesh':
      return solid('url(#mesh)')
    case 'chain': {
      const links: string[] = []
      for (let y = 8; y < H; y += 22) {
        if (y > top - 6 && y < bottom + 6) continue
        links.push(`<ellipse cx="${CX}" cy="${y}" rx="${width * 0.28}" ry="10" fill="none" stroke="${c2}" stroke-width="6"/>`)
      }
      return links.join('')
    }
    default: {
      // Metal link bracelet.
      const rows: string[] = []
      for (let y = 0; y < H; y += 26) {
        if (y > top - 20 && y < bottom) continue
        rows.push(`<rect x="${x}" y="${y}" width="${width * 0.3}" height="24" rx="4" fill="url(#metal)"/>`)
        rows.push(`<rect x="${x + width * 0.32}" y="${y}" width="${width * 0.36}" height="24" rx="4" fill="${a.caseColour === 'two-tone' ? '#d9b45a' : c1}"/>`)
        rows.push(`<rect x="${x + width * 0.7}" y="${y}" width="${width * 0.3}" height="24" rx="4" fill="url(#metal)"/>`)
      }
      return rows.join('')
    }
  }
}

function grooves(x: number, width: number, top: number, bottom: number, stroke: string): string {
  const lines: string[] = []
  for (let y = 12; y < H; y += 18) {
    if (y > top - 4 && y < bottom + 4) continue
    lines.push(`<line x1="${x + 6}" y1="${y}" x2="${x + width - 6}" y2="${y}" stroke="${stroke}" stroke-width="3"/>`)
  }
  return lines.join('')
}

function bezel(a: WatchAttributes, g: Geometry, inset: number): string {
  const r = g.innerRadius - 6
  switch (a.bezel) {
    case 'numbered': {
      const ticks = Array.from({ length: 12 }, (_, i) => {
        const ang = (i * Math.PI) / 6 - Math.PI / 2
        const r1 = r - 4
        const r2 = r - inset + 6
        return `<line x1="${CX + r1 * Math.cos(ang)}" y1="${CY + r1 * Math.sin(ang)}" x2="${CX + r2 * Math.cos(ang)}" y2="${CY + r2 * Math.sin(ang)}" stroke="#f2f2f2" stroke-width="${i === 0 ? 5 : 2.5}"/>`
      }).join('')
      const ringFill = a.features.includes('gmt') ? 'none' : a.dialColour === 'blue' ? '#1b2f55' : a.dialColour === 'green' ? '#174a33' : '#1a1a1c'
      const gmtRing = a.features.includes('gmt')
        ? `<path d="M ${CX - r} ${CY} A ${r} ${r} 0 0 1 ${CX + r} ${CY}" stroke="#c0262d" stroke-width="${inset}" fill="none" transform="translate(0,0)"/><path d="M ${CX + r} ${CY} A ${r} ${r} 0 0 1 ${CX - r} ${CY}" stroke="#1d3c8a" stroke-width="${inset}" fill="none"/>`
        : ''
      return g.outline(ringFill, 6) + gmtRing + ticks
    }
    case 'fluted': {
      const lines = Array.from({ length: 60 }, (_, i) => {
        const ang = (i * Math.PI) / 30
        return `<line x1="${CX + (r - 2) * Math.cos(ang)}" y1="${CY + (r - 2) * Math.sin(ang)}" x2="${CX + (r - inset + 6) * Math.cos(ang)}" y2="${CY + (r - inset + 6) * Math.sin(ang)}" stroke="#0003" stroke-width="2"/>`
      }).join('')
      return g.outline('url(#bezelMetal)', 6) + lines
    }
    case 'gems':
      return g.outline('url(#bezelMetal)', 6) + sparkles(g.innerRadius - inset / 2, 18, r - inset / 2 - 2)
    case 'decorative': {
      const screws = Array.from({ length: 8 }, (_, i) => {
        const ang = (i * Math.PI) / 4 + Math.PI / 8
        const rr = r - inset / 2 + 2
        return `<circle cx="${CX + rr * Math.cos(ang)}" cy="${CY + rr * Math.sin(ang)}" r="4" fill="#e5e5e5" stroke="#0005"/>`
      }).join('')
      return g.outline('url(#bezelMetal)', 6) + screws
    }
    default:
      return g.outline('url(#bezelMetal)', 4)
  }
}

function markers(kind: string, r: number, ink: string): string {
  const out: string[] = []
  const at = (i: number, rr: number) => {
    const ang = (i * Math.PI) / 6 - Math.PI / 2
    return [CX + rr * Math.cos(ang), CY + rr * Math.sin(ang)]
  }
  const text = (i: number, label: string, size: number) => {
    const [x, y] = at(i, r - size * 0.9)
    return `<text x="${x}" y="${y + size * 0.35}" font-family="Georgia,serif" font-size="${size}" text-anchor="middle" fill="${ink}">${label}</text>`
  }
  const stick = (i: number, len: number, w: number) => {
    const [x1, y1] = at(i, r)
    const [x2, y2] = at(i, r - len)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>`
  }
  switch (kind) {
    case 'arabic':
      for (let i = 0; i < 12; i++) out.push(i % 3 === 0 ? text(i, String(i === 0 ? 12 : i), Math.min(26, r * 0.28)) : stick(i, r * 0.09, 2))
      break
    case 'roman':
      ;['XII', 'III', 'VI', 'IX'].forEach((l, k) => out.push(text(k * 3, l, Math.min(22, r * 0.22))))
      for (let i = 0; i < 12; i++) if (i % 3) out.push(stick(i, r * 0.08, 1.5))
      break
    case 'minimal':
      out.push(`<circle cx="${CX}" cy="${CY - r + 8}" r="5" fill="${ink}"/>`)
      break
    case 'gems':
      for (let i = 0; i < 12; i++) {
        const [x, y] = at(i, r - 8)
        out.push(`<circle cx="${x}" cy="${y}" r="${i % 3 ? 3.5 : 5}" fill="#fff" stroke="#9ab" stroke-width="1"/>`)
      }
      break
    case 'digital':
      break
    default:
      for (let i = 0; i < 12; i++) out.push(stick(i, i % 3 ? r * 0.13 : r * 0.22, i % 3 ? 3 : 5))
  }
  return out.join('')
}

function hands(r: number, ink: string, a: WatchAttributes): string {
  const hand = (deg: number, len: number, w: number, color: string) => {
    const ang = ((deg - 90) * Math.PI) / 180
    return `<line x1="${CX}" y1="${CY}" x2="${CX + len * Math.cos(ang)}" y2="${CY + len * Math.sin(ang)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`
  }
  const sporty = ['sport-ring', 'chronograph', 'pilot', 'field', 'integrated'].includes(a.style)
  const out = [hand(305, r * 0.55, sporty ? 8 : 5, ink), hand(60, r * 0.85, sporty ? 6 : 3.5, ink)]
  if (a.features.includes('gmt')) out.push(hand(200, r * 0.8, 2.5, '#c0262d'))
  if (sporty || a.style === 'minimalist') out.push(hand(160, r * 0.9, 1.5, sporty ? '#e0442e' : '#c0262d'))
  out.push(`<circle cx="${CX}" cy="${CY}" r="5" fill="${ink}"/>`)
  return out.join('')
}

function subdials(r: number, ink: string, dial: string): string {
  const fill = LIGHT_DIALS.has(dial) ? '#1d1d1f22' : '#ffffff26'
  return [-1, 1, 0]
    .map((k, i) => {
      const x = i < 2 ? CX + k * r * 0.45 : CX
      const y = i < 2 ? CY + 4 : CY + r * 0.48
      return `<circle cx="${x}" cy="${y}" r="${r * 0.2}" fill="${fill}" stroke="${ink}" stroke-opacity="0.5"/>`
    })
    .join('')
}

function moon(r: number): string {
  const y = CY + r * 0.45
  return `<path d="M ${CX - 26} ${y + 12} A 26 26 0 0 1 ${CX + 26} ${y + 12} Z" fill="#1c2b5a"/><circle cx="${CX - 6}" cy="${y + 2}" r="8" fill="#f2d27a"/>`
}

function gears(r: number): string {
  const gear = (x: number, y: number, rr: number) => {
    const teeth = Array.from({ length: 12 }, (_, i) => {
      const ang = (i * Math.PI) / 6
      return `<rect x="${x + (rr + 2) * Math.cos(ang) - 3}" y="${y + (rr + 2) * Math.sin(ang) - 3}" width="6" height="6" fill="#b08d57"/>`
    }).join('')
    return `<circle cx="${x}" cy="${y}" r="${rr}" fill="none" stroke="#b08d57" stroke-width="3"/>${teeth}<circle cx="${x}" cy="${y}" r="4" fill="#c33"/>`
  }
  return gear(CX - r * 0.35, CY + r * 0.3, r * 0.28) + gear(CX + r * 0.3, CY - r * 0.25, r * 0.22) + gear(CX + r * 0.2, CY + r * 0.45, r * 0.16)
}

function screen(a: WatchAttributes, r: number): string {
  const w = r * 1.35
  const h = r * 0.95
  const smart = a.style === 'smart'
  const rings = smart
    ? ['#ff375f', '#7cff4f', '#30d5ff'].map((c, i) => `<circle cx="${CX}" cy="${CY + 18}" r="${34 - i * 10}" fill="none" stroke="${c}" stroke-width="7" stroke-dasharray="${150 - i * 40} 200"/>`).join('')
    : ''
  return `<rect x="${CX - w / 2}" y="${CY - h / 2}" width="${w}" height="${h}" rx="${smart ? 28 : 6}" fill="${smart ? '#050505' : '#9aa38a'}"/>
    <text x="${CX}" y="${CY + (smart ? -22 : 14)}" font-family="'Courier New',monospace" font-weight="700" font-size="${Math.min(smart ? 26 : 44, w * (smart ? 0.2 : 0.26))}" text-anchor="middle" fill="${smart ? '#fff' : '#1f241c'}">10:10</text>${rings}`
}

function sparkles(radius: number, count: number, ring = radius - 10): string {
  return Array.from({ length: count }, (_, i) => {
    const ang = (i * 2 * Math.PI) / count
    return `<circle cx="${CX + ring * Math.cos(ang)}" cy="${CY + ring * Math.sin(ang)}" r="4" fill="#fff" stroke="#a9c1d9" stroke-width="1.2"/>`
  }).join('')
}
