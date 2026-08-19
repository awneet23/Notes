import type { BoardDocument, BoardElement } from './types'
import { boundsOf, smoothPath } from './geometry'
import { extendedShapePath, ICON_PATHS, type ExtendedShape } from './vectorLibrary'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))

function elementSvg(el: BoardElement): string {
  const common = `stroke="${esc(el.stroke)}" fill="${esc(el.fill)}" stroke-width="${el.strokeWidth}" opacity="${el.opacity}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"`
  const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation} ${el.width / 2} ${el.height / 2})`
  if (el.type === 'pen') {
    const points = el.points ?? []
    const naturalWidth = Math.max(1, ...points.map(point => point.x))
    const naturalHeight = Math.max(1, ...points.map(point => point.y))
    return `<g transform="${transform}"><path d="${smoothPath(points)}" transform="scale(${el.width / naturalWidth} ${el.height / naturalHeight})" ${common}/></g>`
  }
  if (el.type === 'rectangle') return `<g transform="${transform}"><rect width="${el.width}" height="${el.height}" rx="8" ${common}/></g>`
  if (el.type === 'ellipse') return `<g transform="${transform}"><ellipse cx="${el.width / 2}" cy="${el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" ${common}/></g>`
  if (el.type === 'diamond') return `<g transform="${transform}"><path d="M ${el.width / 2} 0 L ${el.width} ${el.height / 2} L ${el.width / 2} ${el.height} L 0 ${el.height / 2} Z" ${common}/></g>`
  if (['triangle', 'pentagon', 'hexagon', 'star', 'cloud', 'cylinder', 'speech'].includes(el.type)) return `<g transform="${transform}"><path d="${extendedShapePath(el.type as ExtendedShape, el.width, el.height)}" ${common}/></g>`
  if (el.type === 'icon') {
    const paths = (ICON_PATHS[el.iconName ?? 'check'] ?? ICON_PATHS.check).map(path => `<path d="${path}" vector-effect="non-scaling-stroke"/>`).join('')
    return `<g transform="${transform}" fill="none" stroke="${esc(el.stroke)}" stroke-width="${el.strokeWidth}" opacity="${el.opacity}" stroke-linecap="round" stroke-linejoin="round"><svg width="${el.width}" height="${el.height}" viewBox="0 0 24 24">${paths}</svg></g>`
  }
  if (el.type === 'line' || el.type === 'arrow') {
    const x1 = el.flipX ? el.width : 0, y1 = el.flipY ? el.height : 0
    const x2 = el.flipX ? 0 : el.width, y2 = el.flipY ? 0 : el.height
    const marker = el.type === 'arrow' ? ' marker-end="url(#stillboard-arrow)"' : ''
    return `<g transform="${transform}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${common}${marker}/></g>`
  }
  if (el.type === 'text') {
    const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start'
    const tx = el.align === 'center' ? el.width / 2 : el.align === 'right' ? el.width : 0
    const lines = (el.text ?? '').split('\n').map((line, i) => `<tspan x="${tx}" dy="${i ? 1.25 : 0}em">${esc(line || ' ')}</tspan>`).join('')
    return `<g transform="${transform}"><text x="${tx}" y="${el.fontSize ?? 20}" fill="${esc(el.stroke)}" stroke="none" opacity="${el.opacity}" text-anchor="${anchor}" font-family="${esc(el.fontFamily ?? 'Inter, sans-serif')}" font-size="${el.fontSize ?? 20}" font-weight="${el.bold ? 700 : 400}" font-style="${el.italic ? 'italic' : 'normal'}">${lines}</text></g>`
  }
  return ''
}

export function createSvg(elements: BoardElement[], background = '#ffffff'): { svg: string; width: number; height: number } {
  const b = boundsOf(elements) ?? { x: 0, y: 0, width: 1200, height: 800 }
  const pad = 32
  const width = Math.max(Math.ceil(b.width + pad * 2), 1), height = Math.max(Math.ceil(b.height + pad * 2), 1)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${b.x - pad} ${b.y - pad} ${width} ${height}"><defs><marker id="stillboard-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs><rect x="${b.x - pad}" y="${b.y - pad}" width="${width}" height="${height}" fill="${background}"/>${elements.map(elementSvg).join('')}</svg>`
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

export function exportSvg(elements: BoardElement[], name: string, background = '#ffffff') {
  const { svg } = createSvg(elements, background)
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${safeName(name)}.svg`)
}

export async function exportPng(elements: BoardElement[], name: string, background = '#ffffff') {
  const { svg, width, height } = createSvg(elements, background)
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
