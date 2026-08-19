import type { BoardElement, Point } from './types'

export type Bounds = { x: number; y: number; width: number; height: number }

export function elementBounds(el: BoardElement): Bounds {
  return { x: el.x, y: el.y, width: Math.max(el.width, 1), height: Math.max(el.height, 1) }
}

export function boundsOf(elements: BoardElement[]): Bounds | null {
  if (!elements.length) return null
  const boxes = elements.map(elementBounds)
  const x1 = Math.min(...boxes.map(b => b.x))
  const y1 = Math.min(...boxes.map(b => b.y))
  const x2 = Math.max(...boxes.map(b => b.x + b.width))
  const y2 = Math.max(...boxes.map(b => b.y + b.height))
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

export function pointsToElement(points: Point[], attrs: Omit<BoardElement, 'x' | 'y' | 'width' | 'height' | 'points'>): BoardElement {
  const minX = Math.min(...points.map(p => p.x))
  const minY = Math.min(...points.map(p => p.y))
  const maxX = Math.max(...points.map(p => p.x))
  const maxY = Math.max(...points.map(p => p.y))
  return {
    ...attrs,
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    points: points.map(p => ({ x: p.x - minX, y: p.y - minY })),
  }
}

export function smoothPath(points: Point[]): string {
  if (points.length < 2) return points.length ? `M ${points[0].x} ${points[0].y} l .01 .01` : ''
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }
    d += ` Q ${points[i].x} ${points[i].y} ${mid.x} ${mid.y}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

const perpendicularDistance = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x, dy = end.y - start.y
  if (!dx && !dy) return distance(point, start)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy })
}

const simplify = (points: Point[], tolerance: number): Point[] => {
  if (points.length <= 2) return points
  let maxDistance = 0, split = 0
  for (let i = 1; i < points.length - 1; i++) {
    const error = perpendicularDistance(points[i], points[0], points[points.length - 1])
    if (error > maxDistance) { maxDistance = error; split = i }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]]
  return [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)]
}

export function recognizeStroke(points: Point[]): 'line' | 'ellipse' | 'rectangle' | 'diamond' | 'triangle' | 'star' | null {
  if (points.length < 4) return 'line'
  const first = points[0], last = points[points.length - 1]
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x))
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y))
  const diagonal = Math.max(Math.hypot(maxX - minX, maxY - minY), 1)
  const direct = distance(first, last)
  let travel = 0
  for (let i = 1; i < points.length; i++) travel += distance(points[i - 1], points[i])
  if (direct / Math.max(travel, 1) > .9) return 'line'
  if (distance(first, last) > diagonal * .28) return null

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const rx = Math.max((maxX - minX) / 2, 1), ry = Math.max((maxY - minY) / 2, 1)
  const ellipseError = points.reduce((sum, p) => sum + Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1), 0) / points.length
  const edgeError = points.reduce((sum, p) => {
    const dx = Math.min(Math.abs(p.x - minX), Math.abs(p.x - maxX))
    const dy = Math.min(Math.abs(p.y - minY), Math.abs(p.y - maxY))
    return sum + Math.min(dx, dy) / diagonal
  }, 0) / points.length
  const simplified = simplify(points, diagonal * .055)
  const vertices = simplified.slice(0, distance(simplified[0], simplified[simplified.length - 1]) < diagonal * .3 ? -1 : undefined)

  if (vertices.length <= 3) return 'triangle'
  if (vertices.length === 4) {
    const corners = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }]
    const midpoints = [{ x: cx, y: minY }, { x: maxX, y: cy }, { x: cx, y: maxY }, { x: minX, y: cy }]
    const score = (targets: Point[]) => vertices.reduce((sum, point) => sum + Math.min(...targets.map(target => distance(point, target))), 0)
    return score(midpoints) < score(corners) ? 'diamond' : 'rectangle'
  }

  const normalizedRadii = vertices.map(point => Math.hypot((point.x - cx) / rx, (point.y - cy) / ry))
  const averageRadius = normalizedRadii.reduce((sum, value) => sum + value, 0) / Math.max(normalizedRadii.length, 1)
  const radiusVariation = Math.sqrt(normalizedRadii.reduce((sum, value) => sum + (value - averageRadius) ** 2, 0) / Math.max(normalizedRadii.length, 1)) / Math.max(averageRadius, .01)
  if (vertices.length >= 8 && radiusVariation > .18) return 'star'
  return ellipseError < edgeError * 3.2 ? 'ellipse' : 'rectangle'
}

/** Returns surviving freehand runs in world coordinates, or null when the eraser missed. */
export function erasePenPoints(el: BoardElement, center: Point, radius: number): Point[][] | null {
  if (el.type !== 'pen' || !el.points?.length) return null
  const naturalWidth = Math.max(1, ...el.points.map(point => point.x))
  const naturalHeight = Math.max(1, ...el.points.map(point => point.y))
  const angle = el.rotation * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const cx = el.width / 2, cy = el.height / 2
  const worldPoints = el.points.map(point => {
    const x = point.x * el.width / naturalWidth, y = point.y * el.height / naturalHeight
    const dx = x - cx, dy = y - cy
    return { x: el.x + cx + dx * cos - dy * sin, y: el.y + cy + dx * sin + dy * cos }
  })
  const sampled: Point[] = []
  for (let index = 0; index < worldPoints.length - 1; index++) {
    const start = worldPoints[index], end = worldPoints[index + 1]
    const steps = Math.max(1, Math.ceil(distance(start, end) / Math.max(radius * .35, 1)))
    for (let step = 0; step < steps; step++) {
      const t = step / steps
      sampled.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t })
    }
  }
  sampled.push(worldPoints[worldPoints.length - 1])
  if (!sampled.some(point => distance(point, center) <= radius)) return null
  const runs: Point[][] = []
  let run: Point[] = []
  for (const point of sampled) {
    if (distance(point, center) > radius) run.push(point)
    else if (run.length) { if (run.length > 1) runs.push(run); run = [] }
  }
  if (run.length > 1) runs.push(run)
  return runs
}

export function wrapText(value: string, width: number, fontSize: number): string[] {
  const maxCharacters = Math.max(1, Math.floor(width / Math.max(fontSize * .62, 1)))
  const output: string[] = []
  for (const paragraph of value.split('\n')) {
    if (!paragraph) { output.push(''); continue }
    let remaining = paragraph
    while (remaining.length > maxCharacters) {
      const candidate = remaining.slice(0, maxCharacters + 1)
      const space = candidate.lastIndexOf(' ')
      const length = space > Math.floor(maxCharacters * .35) ? space : maxCharacters
      output.push(remaining.slice(0, length).trimEnd())
      remaining = remaining.slice(length).trimStart()
    }
    output.push(remaining)
  }
  return output.length ? output : ['']
}

export function normalizedBox(a: Point, b: Point, constrain = false): Bounds & { flipX: boolean; flipY: boolean } {
  let dx = b.x - a.x, dy = b.y - a.y
  if (constrain) {
    const size = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * size
    dy = Math.sign(dy || 1) * size
  }
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), width: Math.max(Math.abs(dx), 1), height: Math.max(Math.abs(dy), 1), flipX: dx < 0, flipY: dy < 0 }
}
