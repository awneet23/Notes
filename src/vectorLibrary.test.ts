import { describe, expect, it } from 'vitest'
import { extendedShapePath, ICON_PATHS, type ExtendedShape } from './vectorLibrary'

describe('shape and icon vector library', () => {
  it('produces valid paths for every extended shape', () => {
    const shapes: ExtendedShape[] = ['triangle', 'pentagon', 'hexagon', 'star', 'cloud', 'cylinder', 'speech']
    for (const shape of shapes) {
      const path = extendedShapePath(shape, 120, 80)
      expect(path.startsWith('M ')).toBe(true)
      expect(path).not.toContain('NaN')
      expect(path.length).toBeGreaterThan(20)
    }
  })

  it('provides vector geometry for every icon stamp', () => {
    expect(Object.keys(ICON_PATHS)).toEqual(['check', 'cross', 'heart', 'idea', 'person', 'home', 'database', 'flag'])
    for (const paths of Object.values(ICON_PATHS)) expect(paths.length).toBeGreaterThan(0)
  })
})
