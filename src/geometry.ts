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

export function recognizeStroke(points: Point[]): 'line' | 'ellipse' | 'rectangle' | null {
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
  return ellipseError < edgeError * 3.2 ? 'ellipse' : 'rectangle'
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
