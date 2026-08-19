import type { BoardElement } from './types'

export type ExtendedShape = Extract<BoardElement['type'], 'triangle' | 'pentagon' | 'hexagon' | 'star' | 'cloud' | 'cylinder' | 'speech'>

const polygon = (sides: number, width: number, height: number, rotation = -Math.PI / 2) => {
  const cx = width / 2, cy = height / 2
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + index * Math.PI * 2 / sides
    return `${cx + Math.cos(angle) * width / 2} ${cy + Math.sin(angle) * height / 2}`
  }).join(' L ')
}

export function extendedShapePath(type: ExtendedShape, width: number, height: number): string {
  if (type === 'triangle') return `M ${width / 2} 0 L ${width} ${height} L 0 ${height} Z`
  if (type === 'pentagon') return `M ${polygon(5, width, height)} Z`
  if (type === 'hexagon') return `M ${width * .25} 0 L ${width * .75} 0 L ${width} ${height / 2} L ${width * .75} ${height} L ${width * .25} ${height} L 0 ${height / 2} Z`
  if (type === 'star') {
    const cx = width / 2, cy = height / 2
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 5
      const radius = index % 2 ? .22 : .5
      return `${cx + Math.cos(angle) * width * radius},${cy + Math.sin(angle) * height * radius}`
    })
    return `M ${points.join(' L ')} Z`
  }
  if (type === 'cloud') return `M ${width * .23} ${height * .76} C ${width * .08} ${height * .76}, ${width * .04} ${height * .55}, ${width * .17} ${height * .46} C ${width * .15} ${height * .25}, ${width * .4} ${height * .14}, ${width * .54} ${height * .3} C ${width * .7} ${height * .17}, ${width * .9} ${height * .31}, ${width * .87} ${height * .5} C ${width * 1.02} ${height * .61}, ${width * .92} ${height * .8}, ${width * .77} ${height * .78} Z`
  if (type === 'cylinder') return `M ${width * .12} ${height * .18} C ${width * .12} ${height * .02}, ${width * .88} ${height * .02}, ${width * .88} ${height * .18} V ${height * .82} C ${width * .88} ${height * .98}, ${width * .12} ${height * .98}, ${width * .12} ${height * .82} Z M ${width * .12} ${height * .18} C ${width * .12} ${height * .34}, ${width * .88} ${height * .34}, ${width * .88} ${height * .18}`
  return `M 0 0 H ${width} V ${height * .72} H ${width * .38} L ${width * .2} ${height} L ${width * .22} ${height * .72} H 0 Z`
}

export const ICON_PATHS: Record<string, string[]> = {
  check: ['M20 6 9 17l-5-5'],
  cross: ['M18 6 6 18', 'M6 6l12 12'],
  heart: ['M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z'],
  idea: ['M9 18h6', 'M10 22h4', 'M8.5 14.5A6 6 0 1 1 15.5 14.5C14.5 15.2 14 16 14 18h-4c0-2-.5-2.8-1.5-3.5Z'],
  person: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  home: ['M3 11 12 3l9 8', 'M5 10v10h14V10', 'M9 20v-6h6v6'],
  database: ['M4 6c0-2 3.6-3 8-3s8 1 8 3-3.6 3-8 3-8-1-8-3Z', 'M4 6v6c0 2 3.6 3 8 3s8-1 8-3V6', 'M4 12v6c0 2 3.6 3 8 3s8-1 8-3v-6'],
  flag: ['M5 22V4', 'M5 4h12l-2 4 2 4H5'],
}
