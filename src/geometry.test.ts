import { describe, expect, it } from 'vitest'
import { normalizedBox, pointsToElement, recognizeStroke } from './geometry'

describe('whiteboard geometry', () => {
  it('recognizes a rough straight stroke', () => {
    expect(recognizeStroke([{ x: 0, y: 0 }, { x: 25, y: 1 }, { x: 50, y: 0 }, { x: 100, y: 1 }])).toBe('line')
  })

  it('normalizes reverse-direction shape drags', () => {
    expect(normalizedBox({ x: 100, y: 80 }, { x: 20, y: 10 })).toMatchObject({ x: 20, y: 10, width: 80, height: 70, flipX: true, flipY: true })
  })

  it('stores freehand points relative to their element bounds', () => {
    const pen = pointsToElement([{ x: 10, y: 20 }, { x: 30, y: 50 }], { id: 'pen', type: 'pen', rotation: 0, stroke: '#000', fill: 'transparent', strokeWidth: 3, opacity: 1 })
    expect(pen).toMatchObject({ x: 10, y: 20, width: 20, height: 30, points: [{ x: 0, y: 0 }, { x: 20, y: 30 }] })
  })
})
