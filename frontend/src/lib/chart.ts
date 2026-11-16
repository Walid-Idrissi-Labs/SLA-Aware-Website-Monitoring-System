/**
 * Shared chart geometry. Kept in one place so the latency chart and the
 * multi-series trend chart draw the same curve with the same code.
 */

/** Catmull-Rom → cubic Bézier. Smooth, and stable on both sparse and dense data. */
export function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return d
}

/** Rounds an axis maximum up to a friendly number (1, 2, 5 × 10ⁿ). */
export function niceMax(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const scaled = raw / magnitude
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * magnitude
}
