/**
 * The liquid-glass dials.
 *
 * --glass-level (0 → 1) is the transparency dial. It drives tint alpha, blur
 * radius, saturation and rim brightness in CSS:
 *   0 = clear   — almost no tint, barely any blur, refraction does the work
 *   1 = frosted — heavy tint and blur, the background is a soft wash
 * Apple's look lives at the low end: thin blur, strong refraction. Blur past
 * ~0.5 starts washing the rim distortion out, which is what makes glass read
 * as plain frosting.
 *
 * --glass-distortion is the refraction strength (negative bulges outward).
 * It's baked into the generated SVG filters, so changing it rebuilds them.
 *
 * --glass-edge is the white specular rim: the inner glow and the hairline
 * border. Pure CSS, applies instantly.
 *
 * Tune live from the devtools console; all are persisted across reloads:
 *   setGlass(0.15)           — more transparent
 *   setGlassDistortion(-240) — heavier refraction
 *   setGlassEdge(0.15)       — fainter white rim (0 removes it)
 *   setGlassLens(false)      — refraction off, plain blur only
 */

const STORAGE_KEY = 'glass-level'
const LENS_KEY = 'glass-lens'
const DISTORTION_KEY = 'glass-distortion'
const EDGE_KEY = 'glass-edge'

/** Specular edge strength: 1 = the reference component's full white rim. */
export const GLASS_EDGE_DEFAULT = 0.4

/** Named stops. Apple's clear ↔ regular glass, roughly. */
export const GLASS_PRESETS = {
  clear: 0.99,
  light: 0.22,
  regular: 0.38,
  frosted: 0.62,
} as const

export const GLASS_DEFAULT = GLASS_PRESETS.light

/**
 * Fixed parameters of the refraction itself, ported from the reference
 * GlassSurface component. The R/G/B offsets are what produce the colour
 * fringing along the rim — drop them to 0/0/0 and the glass goes lifeless.
 */
export const GLASS_TUNING = {
  /** Rim band width, as a fraction of the element's shorter side. */
  borderWidth: 0.001,
  /** Lightness of the map's neutral centre — 50% = no displacement. */
  brightness: 50,
  opacity: 0.43,
  /** Blur applied inside the map, easing the rim into the flat centre. */
  mapBlur: 110,
  /** Blur applied after displacement, hiding sampling artefacts. */
  displace: 0.17,
  distortion: -20,
  redOffset: 1,
  greenOffset: 0,
  blueOffset: 0,
} as const

const CHANGE_EVENT = 'glass:change'

const clamp = (n: number) => Math.min(1, Math.max(0, n))

function announce() {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

/** Subscribe to dial changes. Returns an unsubscribe function. */
export function onGlassChange(fn: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, fn)
  return () => window.removeEventListener(CHANGE_EVENT, fn)
}

export function getGlassLevel(): number {
  const raw = localStorage.getItem(STORAGE_KEY)
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) ? clamp(n) : GLASS_DEFAULT
}

/** Transparency, 0 (clear) → 1 (frosted). */
export function setGlassLevel(level: number): number {
  const v = clamp(level)
  document.documentElement.style.setProperty('--glass-level', String(v))
  localStorage.setItem(STORAGE_KEY, String(v))
  announce()
  return v
}

export function getGlassDistortion(): number {
  const raw = localStorage.getItem(DISTORTION_KEY)
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) ? n : GLASS_TUNING.distortion
}

/** Refraction strength. Negative bulges outward; around -180 is the reference. */
export function setGlassDistortion(scale: number): number {
  document.documentElement.style.setProperty('--glass-distortion', String(scale))
  localStorage.setItem(DISTORTION_KEY, String(scale))
  announce()
  return scale
}

export function getGlassEdge(): number {
  const raw = localStorage.getItem(EDGE_KEY)
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) ? Math.max(0, n) : GLASS_EDGE_DEFAULT
}

/**
 * White specular edge — the rim glow and the hairline border. 0 removes it
 * entirely, 1 is the reference component's full brightness. Pure CSS, so it
 * applies instantly without rebuilding any filters.
 */
export function setGlassEdge(strength: number): number {
  const v = Math.max(0, strength)
  document.documentElement.style.setProperty('--glass-edge', String(v))
  localStorage.setItem(EDGE_KEY, String(v))
  return v
}

/**
 * Toggle refraction entirely. Off leaves plain blur + tint — which is also what
 * Safari and Firefox render, since they reject url() in backdrop-filter.
 */
export function setGlassLens(enabled: boolean): boolean {
  document.documentElement.classList.toggle('glass-flat', !enabled)
  localStorage.setItem(LENS_KEY, enabled ? '1' : '0')
  announce()
  return enabled
}

export function getGlassLens(): boolean {
  return localStorage.getItem(LENS_KEY) !== '0'
}

/** Called once at boot, before first paint, to restore stored settings. */
export function initGlass(): void {
  const root = document.documentElement
  root.style.setProperty('--glass-level', String(getGlassLevel()))
  root.style.setProperty('--glass-distortion', String(getGlassDistortion()))
  root.style.setProperty('--glass-edge', String(getGlassEdge()))
  root.classList.toggle('glass-flat', !getGlassLens())

  if (import.meta.env.DEV) {
    Object.assign(window, {
      setGlass: setGlassLevel,
      setGlassDistortion,
      setGlassEdge,
      setGlassLens,
    })
  }
}
