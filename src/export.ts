import type { BoardDocument, BoardElement, CanvasPattern } from './types'
import { boundsOf, smoothPath, wrapText } from './geometry'
import { extendedShapePath, ICON_PATHS, type ExtendedShape } from './vectorLibrary'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))

function elementSvg(el: BoardElement): string {
  const common = `stroke="${esc(el.stroke)}" fill="${esc(el.fill)}" stroke-width="${el.strokeWidth}" opacity="${el.opacity}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`
  const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation} ${el.width / 2} ${el.height / 2})`
  const label = (() => {
    if (!el.label) return ''
    const size = el.type === 'arrow' || el.type === 'line' ? 12 : 14
    const labelLines = wrapText(el.label, Math.max(70, el.width - 18), size)
    const y = el.type === 'arrow' || el.type === 'line' ? el.height / 2 - 7 : el.height / 2 - (labelLines.length - 1) * 9 + 5
    const lines = labelLines.map((line, index) => `<tspan x="${el.width / 2}" dy="${index ? 1.25 : 0}em">${esc(line)}</tspan>`).join('')
    return `<text x="${el.width / 2}" y="${y}" text-anchor="middle" fill="#24463a" stroke="none" font-family="Inter, sans-serif" font-size="${size}" font-weight="650">${lines}</text>`
  })()
  if (el.type === 'pen') {
    const points = el.points ?? []
    const naturalWidth = Math.max(1, ...points.map(point => point.x))
    const naturalHeight = Math.max(1, ...points.map(point => point.y))
    return `<g transform="${transform}"><path d="${smoothPath(points)}" transform="scale(${el.width / naturalWidth} ${el.height / naturalHeight})" ${common}/>${label}</g>`
  }
  if (el.type === 'rectangle') return `<g transform="${transform}"><rect width="${el.width}" height="${el.height}" rx="8" ${common}/>${label}</g>`
  if (el.type === 'ellipse') return `<g transform="${transform}"><ellipse cx="${el.width / 2}" cy="${el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" ${common}/>${label}</g>`
  if (el.type === 'diamond') return `<g transform="${transform}"><path d="M ${el.width / 2} 0 L ${el.width} ${el.height / 2} L ${el.width / 2} ${el.height} L 0 ${el.height / 2} Z" ${common}/>${label}</g>`
  if (['triangle', 'pentagon', 'hexagon', 'star', 'cloud', 'cylinder', 'speech'].includes(el.type)) return `<g transform="${transform}"><path d="${extendedShapePath(el.type as ExtendedShape, el.width, el.height)}" ${common}/>${label}</g>`
  if (el.type === 'icon') {
    const paths = (ICON_PATHS[el.iconName ?? 'check'] ?? ICON_PATHS.check).map(path => `<path d="${path}" vector-effect="non-scaling-stroke"/>`).join('')
    return `<g transform="${transform}" fill="none" stroke="${esc(el.stroke)}" stroke-width="${el.strokeWidth}" opacity="${el.opacity}" stroke-linecap="round" stroke-linejoin="round"><svg width="${el.width}" height="${el.height}" viewBox="0 0 24 24">${paths}</svg>${label}</g>`
  }
  if (el.type === 'line' || el.type === 'arrow') {
    const x1 = el.flipX ? el.width : 0, y1 = el.flipY ? el.height : 0
    const x2 = el.flipX ? 0 : el.width, y2 = el.flipY ? 0 : el.height
    const marker = el.type === 'arrow' ? ' marker-end="url(#stillboard-arrow)"' : ''
    return `<g transform="${transform}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${common}${marker}/>${label}</g>`
  }
  if (el.type === 'text') {
    const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start'
    const tx = el.align === 'center' ? el.width / 2 : el.align === 'right' ? el.width : 0
    const textLines = el.textBox ? wrapText(el.text ?? '', el.width, el.fontSize ?? 20) : (el.text ?? '').split('\n')
    const lines = textLines.map((line, i) => `<tspan x="${tx}" dy="${i ? 1.3 : 0}em">${esc(line || ' ')}</tspan>`).join('')
    return `<g transform="${transform}"><text x="${tx}" y="${el.fontSize ?? 20}" fill="${esc(el.stroke)}" stroke="none" opacity="${el.opacity}" text-anchor="${anchor}" font-family="${esc(el.fontFamily ?? 'Inter, sans-serif')}" font-size="${el.fontSize ?? 20}" font-weight="${el.bold ? 700 : 400}" font-style="${el.italic ? 'italic' : 'normal'}">${lines}</text></g>`
  }
  return ''
}

const patternDefinition = (pattern: CanvasPattern, color: string) => {
  if (pattern === 'plain') return ''
  if (pattern === 'dots') return `<pattern id="stillboard-paper" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${color}"/></pattern>`
  if (pattern === 'grid') return `<pattern id="stillboard-paper" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${color}" stroke-width="0.8"/></pattern>`
  if (pattern === 'ruled') return `<pattern id="stillboard-paper" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M0 31.5H32" fill="none" stroke="${color}" stroke-width="0.8"/></pattern>`
  return `<pattern id="stillboard-paper" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M13 16h6M16 13v6" fill="none" stroke="${color}" stroke-width="0.9" stroke-linecap="round"/></pattern>`
}

const isDark = (color: string) => {
  const value = color.replace('#', '')
  if (value.length !== 6) return false
  const [r, g, b] = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16))
  return (r * 299 + g * 587 + b * 114) / 1000 < 118
}

export function createSvg(elements: BoardElement[], background = '#ffffff', canvasPattern: CanvasPattern = 'plain'): { svg: string; width: number; height: number } {
  const b = boundsOf(elements) ?? { x: 0, y: 0, width: 1200, height: 800 }
  const pad = 32
  const width = Math.max(Math.ceil(b.width + pad * 2), 1), height = Math.max(Math.ceil(b.height + pad * 2), 1)
  const pattern = patternDefinition(canvasPattern, isDark(background) ? '#59645f' : '#d5d5cf')
  const paperOverlay = canvasPattern === 'plain' ? '' : `<rect x="${b.x - pad}" y="${b.y - pad}" width="${width}" height="${height}" fill="url(#stillboard-paper)"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${b.x - pad} ${b.y - pad} ${width} ${height}"><defs><marker id="stillboard-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>${pattern}</defs><rect x="${b.x - pad}" y="${b.y - pad}" width="${width}" height="${height}" fill="${background}"/>${paperOverlay}${elements.map(elementSvg).join('')}</svg>`
  return { svg, width, height }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

export function exportProject(doc: BoardDocument) {
  downloadBlob(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `${safeName(doc.name)}.stillboard`)
}

export function exportSvg(elements: BoardElement[], name: string, background = '#ffffff', canvasPattern: CanvasPattern = 'plain') {
  const { svg } = createSvg(elements, background, canvasPattern)
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${safeName(name)}.svg`)
}

export async function exportPng(elements: BoardElement[], name: string, background = '#ffffff', canvasPattern: CanvasPattern = 'plain') {
  const { svg, width, height } = createSvg(elements, background, canvasPattern)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const img = new Image()
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url })
  const scale = Math.min(2, 8192 / Math.max(width, height))
  const canvas = document.createElement('canvas'); canvas.width = width * scale; canvas.height = height * scale
  const ctx = canvas.getContext('2d')!; ctx.scale(scale, scale); ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(url)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (blob) downloadBlob(blob, `${safeName(name)}.png`)
}

const safeName = (name: string) => name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'board'
