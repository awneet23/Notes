import { describe, expect, it } from 'vitest'
import { createSvg } from './export'
import type { BoardElement } from './types'

describe('vector export', () => {
  it('preserves shapes, arrows, scaled pen strokes, and escaped text', () => {
    const base = { x: 0, y: 0, width: 100, height: 50, rotation: 0, stroke: '#111', fill: 'transparent', strokeWidth: 3, opacity: 1 }
    const elements: BoardElement[] = [
      { ...base, id: 'rect', type: 'rectangle' },
      { ...base, id: 'arrow', type: 'arrow' },
      { ...base, id: 'pen', type: 'pen', points: [{ x: 0, y: 0 }, { x: 50, y: 25 }] },
      { ...base, id: 'text', type: 'text', text: 'A & B', fontSize: 20, fontFamily: 'sans-serif', align: 'left' },
      { ...base, id: 'star', type: 'star' },
      { ...base, id: 'heart', type: 'icon', iconName: 'heart' },
    ]

    const { svg, width, height } = createSvg(elements, '#eaf1f8')
    expect(width).toBeGreaterThan(100)
    expect(height).toBeGreaterThan(50)
    expect(svg).toContain('<rect width="100" height="50"')
    expect(svg).toContain('marker-end="url(#stillboard-arrow)"')
    expect(svg).toContain('transform="scale(2 2)"')
    expect(svg).toContain('A &amp; B')
    expect(svg).toContain('fill="#eaf1f8"')
    expect(svg).toContain('viewBox="0 0 24 24"')
    expect(svg).toContain('a5.5 5.5')
  })
})
