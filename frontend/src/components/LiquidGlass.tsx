import { useEffect } from 'react'
import { GLASS_TUNING, onGlassChange } from '../lib/glass'

/**
 * Liquid glass refraction, applied to every glass surface in the app.
 *
 * The displacement map is an SVG built per element, at that element's exact
 * size and corner radius:
 *   - a red gradient running right→left  drives horizontal displacement
 *   - a blue gradient running top→bottom drives vertical, difference-blended
 *     over the red so each keeps its own channel
 *   - a blurred, inset grey rect sits on top: mid-grey means "no displacement",
 *     so the middle of the pane stays true and only a thin rim band bends
 * The backdrop is then sampled three times at slightly different scales — red,
 * green, blue — and screen-blended back together. That per-channel offset is
 * the colour fringing along the rim, and it's the thing that actually reads as
 * Apple's glass rather than as a blur.
 *
 * This is applied imperatively rather than through a wrapper component because
 * every filter has to match one specific element's box; the panels, sidebar and
 * modals keep their own markup and layout untouched.
 *
 * Chromium only. Safari and Firefox reject url() inside backdrop-filter, so
 * they're detected and skipped — those visitors keep the plain CSS blur.
 */

const SELECTOR = '.panel, .panel-flush, .glass'
const SVG_NS = 'http://www.w3.org/2000/svg'

/** Chromium is the only engine that resolves url() filters in backdrop-filter. */
function supportsBackdropUrl(): boolean {
  const ua = navigator.userAgent
  const isWebkit = /Safari/.test(ua) && !/Chrome/.test(ua)
  if (isWebkit || /Firefox/.test(ua)) return false

  const probe = document.createElement('div')
  probe.style.backdropFilter = 'url(#probe)'
  return probe.style.backdropFilter !== ''
}

/** The per-element displacement map, as a data URI. */
function displacementMap(w: number, h: number, radius: number): string {
  const t = GLASS_TUNING
  const edge = Math.min(w, h) * (t.borderWidth * 0.5)
  const inner = { w: Math.max(0, w - edge * 2), h: Math.max(0, h - edge * 2) }

  const svg =
    `<svg viewBox="0 0 ${w} ${h}" xmlns="${SVG_NS}">` +
    `<defs>` +
    `<linearGradient id="x" x1="100%" y1="0%" x2="0%" y2="0%">` +
    `<stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/>` +
    `</linearGradient>` +
    `<linearGradient id="y" x1="0%" y1="0%" x2="0%" y2="100%">` +
    `<stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="${w}" height="${h}" fill="black"/>` +
    `<rect width="${w}" height="${h}" rx="${radius}" fill="url(#x)"/>` +
    `<rect width="${w}" height="${h}" rx="${radius}" fill="url(#y)" style="mix-blend-mode:difference"/>` +
    `<rect x="${edge}" y="${edge}" width="${inner.w}" height="${inner.h}" rx="${radius}" ` +
    `fill="hsl(0 0% ${t.brightness}% / ${t.opacity})" style="filter:blur(${t.mapBlur}px)"/>` +
    `</svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** One <filter>: three displacements of the same backdrop, recombined. */
function filterMarkup(id: string, map: string, distortion: number): string {
  const t = GLASS_TUNING
  const channel = (offset: number, result: string, matrix: string) =>
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="${distortion + offset}" ` +
    `xChannelSelector="R" yChannelSelector="G" result="d-${result}"/>` +
    `<feColorMatrix in="d-${result}" type="matrix" values="${matrix}" result="${result}"/>`

  return (
    `<filter id="${id}" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">` +
    `<feImage href="${map}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>` +
    channel(t.redOffset, 'r', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0') +
    channel(t.greenOffset, 'g', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0') +
    channel(t.blueOffset, 'b', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0') +
    `<feBlend in="r" in2="g" mode="screen" result="rg"/>` +
    `<feBlend in="rg" in2="b" mode="screen" result="rgb"/>` +
    `<feGaussianBlur in="rgb" stdDeviation="${t.displace}"/>` +
    `</filter>`
  )
}

export default function LiquidGlass() {
  useEffect(() => {
    if (!supportsBackdropUrl()) return

    // Hidden host for the generated filters.
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('style', 'position:absolute;width:0;height:0;pointer-events:none')
    const defs = document.createElementNS(SVG_NS, 'defs')
    svg.appendChild(defs)
    document.body.appendChild(svg)

    const tracked = new Set<HTMLElement>()
    let frame = 0
    let signature = ''
    let nextId = 0

    const sync = () => {
      frame = 0

      // setGlassLens(false): strip the filters and let the CSS blur stand.
      if (document.documentElement.classList.contains('glass-flat')) {
        for (const el of tracked) el.style.backdropFilter = ''
        defs.innerHTML = ''
        signature = 'flat'
        return
      }

      const distortion = Number(
        getComputedStyle(document.documentElement).getPropertyValue('--glass-distortion')
      ) || GLASS_TUNING.distortion

      const specs: Array<{ el: HTMLElement; id: string; map: string }> = []
      const keys: string[] = []

      for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
        if (!tracked.has(el)) {
          tracked.add(el)
          resize.observe(el)
        }
        const { width, height } = el.getBoundingClientRect()
        if (width < 2 || height < 2) continue

        // Round to whole pixels so sub-pixel jitter doesn't rebuild every frame.
        const w = Math.round(width)
        const h = Math.round(height)
        const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0

        let id = el.dataset.glassId
        if (!id) {
          id = `glass-${nextId++}`
          el.dataset.glassId = id
        }

        keys.push(`${id}:${w}x${h}:${radius}`)
        specs.push({ el, id, map: displacementMap(w, h, radius) })
      }

      // Drop surfaces that have left the DOM — routes and modals churn them.
      for (const el of tracked) {
        if (!el.isConnected) {
          resize.unobserve(el)
          tracked.delete(el)
        }
      }

      const next = `${keys.join('|')}|${distortion}`
      if (next === signature) return
      signature = next

      defs.innerHTML = specs.map(s => filterMarkup(s.id, s.map, distortion)).join('')
      for (const { el, id } of specs) {
        // blur/saturate stay as vars so the intensity dial keeps working live.
        el.style.backdropFilter = `url(#${id}) saturate(var(--glass-sat)) blur(var(--glass-blur))`
      }
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync)
    }

    const resize = new ResizeObserver(schedule)
    // Route changes and modals add and remove glass surfaces.
    const mutations = new MutationObserver(schedule)
    mutations.observe(document.body, { childList: true, subtree: true })
    const offGlassChange = onGlassChange(() => {
      signature = '' // force a rebuild: distortion is baked into the filter
      schedule()
    })

    schedule()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
      offGlassChange()
      for (const el of tracked) {
        el.style.backdropFilter = ''
        delete el.dataset.glassId
      }
      svg.remove()
    }
  }, [])

  return null
}
