import { describe, expect, it } from 'vitest'
import { erasePenPoints, normalizedBox, pointsToElement, recognizeStroke, wrapText } from './geometry'

describe('whiteboard geometry', () => {
  it('recognizes a rough straight stroke', () => {
    expect(recognizeStroke([{ x: 0, y: 0 }, { x: 25, y: 1 }, { x: 50, y: 0 }, { x: 100, y: 1 }])).toBe('line')
  })

  it('recognizes closed triangles, diamonds, rectangles, and stars', () => {
    expect(recognizeStroke([{ x: 0, y: 100 }, { x: 50, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }])).toBe('triangle')
    expect(recognizeStroke([{ x: 50, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 50 }, { x: 50, y: 0 }])).toBe('diamond')
    expect(recognizeStroke([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 70 }, { x: 0, y: 70 }, { x: 0, y: 0 }])).toBe('rectangle')
    const star = Array.from({ length: 11 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 10
      const radius = index % 2 ? 22 : 50
      return { x: 60 + Math.cos(angle) * radius, y: 60 + Math.sin(angle) * radius }
    })
    expect(recognizeStroke(star)).toBe('star')
  })

  it('normalizes reverse-direction shape drags', () => {
    expect(normalizedBox({ x: 100, y: 80 }, { x: 20, y: 10 })).toMatchObject({ x: 20, y: 10, width: 80, height: 70, flipX: true, flipY: true })
  })

  it('stores freehand points relative to their element bounds', () => {
    const pen = pointsToElement([{ x: 10, y: 20 }, { x: 30, y: 50 }], { id: 'pen', type: 'pen', rotation: 0, stroke: '#000', fill: 'transparent', strokeWidth: 3, opacity: 1 })
    expect(pen).toMatchObject({ x: 10, y: 20, width: 20, height: 30, points: [{ x: 0, y: 0 }, { x: 20, y: 30 }] })
  })

  it('splits only the erased portion of a freehand stroke', () => {
    const pen = pointsToElement([{ x: 0, y: 20 }, { x: 100, y: 20 }], { id: 'pen', type: 'pen', rotation: 0, stroke: '#000', fill: 'transparent', strokeWidth: 3, opacity: 1 })
    const runs = erasePenPoints(pen, { x: 50, y: 20 }, 10)
    expect(runs).toHaveLength(2)
    expect(runs?.[0].at(-1)?.x).toBeLessThan(42)
    expect(runs?.[1][0].x).toBeGreaterThan(58)
  })

  it('wraps text to the requested box width', () => {
    expect(wrapText('alpha beta gamma delta', 80, 20)).toEqual(['alpha', 'beta', 'gamma', 'delta'])
  })
})
