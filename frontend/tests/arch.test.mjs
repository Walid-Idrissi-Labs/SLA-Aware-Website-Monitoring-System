// The About page's architecture diagram (src/about/archData.ts): the drawing is
// consistent, and what it claims is still in the code. Run with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EDGES, NODES, STEPS, LAYERS, W, H } from '../src/about/archData.ts'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const byId = new Map(NODES.map((n) => [n.id, n]))

const onBorder = ([x, y], n) =>
  ((x === n.x || x === n.x + n.w) && y >= n.y && y <= n.y + n.h) || ((y === n.y || y === n.y + n.h) && x >= n.x && x <= n.x + n.w)

test('ids are unique and every line joins two boxes, edge to edge', () => {
  assert.equal(byId.size, NODES.length)
  assert.equal(new Set(EDGES.map((e) => e.id)).size, EDGES.length)
  for (const e of EDGES) {
    const from = byId.get(e.from)
    const to = byId.get(e.to)
    assert.ok(from && to, `${e.id}: unknown box`)
    assert.ok(onBorder(e.points[0], from), `${e.id} does not start on ${e.from}`)
    assert.ok(onBorder(e.points.at(-1), to), `${e.id} does not end on ${e.to}`)
  }
})

test('lines are orthogonal, stay on the canvas, and never cross a box', () => {
  for (const e of EDGES) {
    for (let i = 1; i < e.points.length; i++) {
      const [x0, y0] = e.points[i - 1]
      const [x1, y1] = e.points[i]
      assert.ok(x0 === x1 || y0 === y1, `${e.id}: segment ${i} is diagonal`)
      for (const [x, y] of [[x0, y0], [x1, y1]]) assert.ok(x >= 0 && x <= W && y >= 0 && y <= H, `${e.id} leaves the canvas`)
      for (const n of NODES) {
        // Strictly inside the box: touching its border is how a line arrives.
        const xs = [Math.min(x0, x1), Math.max(x0, x1)]
        const ys = [Math.min(y0, y1), Math.max(y0, y1)]
        const crosses = xs[1] > n.x && xs[0] < n.x + n.w && ys[1] > n.y && ys[0] < n.y + n.h
        assert.ok(!crosses, `${e.id} runs through ${n.id}`)
      }
    }
  }
})

test('no label sits on another label or on a box', () => {
  // Chip size as rendered: 10 px mono is about 6.1 px a character, plus padding and border.
  const chip = (e) => {
    const [x, y] = e.labelAt ?? mid(e)
    const w = e.label.length * 6.1 + 14
    return { id: e.id, x0: x - w / 2, x1: x + w / 2, y0: y - 9, y1: y + 9 }
  }
  const mid = (e) => {
    let best = -1
    let at
    for (let i = 1; i < e.points.length; i++) {
      const [a, b] = [e.points[i - 1], e.points[i]]
      const len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])
      if (len > best) [best, at] = [len, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]
    }
    return at
  }
  const chips = EDGES.map(chip)
  const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) assert.ok(!overlap(chips[i], chips[j]), `labels ${chips[i].id} and ${chips[j].id} collide`)
    for (const n of NODES) assert.ok(!overlap(chips[i], { x0: n.x, x1: n.x + n.w, y0: n.y, y1: n.y + n.h }), `label ${chips[i].id} covers ${n.id}`)
  }
})

test('every box is on a layer, and every step names real lines and boxes', () => {
  const layers = new Set(LAYERS.map((l) => l.id))
  for (const e of EDGES) for (const l of e.layers) assert.ok(layers.has(l), `${e.id}: unknown layer ${l}`)
  for (const n of NODES) {
    const on = (n.layers?.length ?? 0) > 0 || EDGES.some((e) => e.from === n.id || e.to === n.id)
    assert.ok(on, `${n.id} is on no layer`)
  }
  assert.equal(STEPS.length, 8)
  const edges = new Set(EDGES.map((e) => e.id))
  for (const s of STEPS) {
    for (const id of s.edges) assert.ok(edges.has(id), `step "${s.title}": unknown line ${id}`)
    for (const id of s.nodes) assert.ok(byId.has(id), `step "${s.title}": unknown box ${id}`)
  }
})

test('each proof link points at a file that still holds its symbol', () => {
  for (const n of NODES) {
    assert.ok((n.proof?.length ?? 0) <= 3, `${n.id} has more than three proofs`)
    for (const p of n.proof ?? []) {
      const file = repo + p.path
      assert.ok(existsSync(file), `${n.id}: ${p.path} is gone`)
      assert.ok(readFileSync(file, 'utf8').includes(p.symbol), `${n.id}: ${p.path} no longer mentions ${p.symbol}`)
    }
  }
})

test('the route lists match the routes Terraform declares', () => {
  const tf = readFileSync(repo + 'sla-monitor-terraform/modules/apigateway/main.tf', 'utf8')
  const declared = [...tf.matchAll(/route_key\s*=\s*"([A-Z]+ [^"]+)"/g)].map((m) => m[1].replace('{project_id}', '{id}')).sort()
  const drawn = NODES.flatMap((n) => (n.routes ?? []).map((r) => `${r.method} ${r.path}`)).sort()
  assert.equal(declared.length, 14)
  assert.deepEqual(drawn, declared)
})
