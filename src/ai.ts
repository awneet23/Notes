import { normalizedBox } from './geometry'
import type { BoardElement, ConnectionSide, Point } from './types'
import { uid } from './types'

export type DiagramNode = {
  id: string
  label: string
  kind: 'client' | 'service' | 'gateway' | 'database' | 'cache' | 'queue' | 'storage' | 'cloud' | 'note'
  x: number
  y: number
  width: number
  height: number
}

export type DiagramEdge = { from: string; to: string; label: string }
export type DiagramPlan = { title: string; nodes: DiagramNode[]; edges: DiagramEdge[] }

const palette: Record<DiagramNode['kind'], { type: BoardElement['type']; fill: string }> = {
  client: { type: 'rectangle', fill: '#deecff' },
  service: { type: 'rectangle', fill: '#e4f3ef' },
  gateway: { type: 'diamond', fill: '#f0e6ff' },
  database: { type: 'cylinder', fill: '#fbf3dc' },
  cache: { type: 'hexagon', fill: '#dff3e8' },
  queue: { type: 'hexagon', fill: '#fff1a8' },
  storage: { type: 'cylinder', fill: '#e5eff9' },
  cloud: { type: 'cloud', fill: '#eceff1' },
  note: { type: 'speech', fill: '#ffe4e4' },
}

const sideToward = (from: DiagramNode, to: DiagramNode): [ConnectionSide, ConnectionSide] => {
  const dx = to.x + to.width / 2 - from.x - from.width / 2
  const dy = to.y + to.height / 2 - from.y - from.height / 2
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['right', 'left'] : ['left', 'right']
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
}

const anchor = (element: BoardElement, side: ConnectionSide): Point => side === 'top'
  ? { x: element.x + element.width / 2, y: element.y }
  : side === 'right' ? { x: element.x + element.width, y: element.y + element.height / 2 }
    : side === 'bottom' ? { x: element.x + element.width / 2, y: element.y + element.height }
      : { x: element.x, y: element.y + element.height / 2 }

export function diagramToElements(plan: DiagramPlan, origin: Point): BoardElement[] {
  const safeNodes = plan.nodes.slice(0, 30).filter(node => node && typeof node.id === 'string' && typeof node.label === 'string' && palette[node.kind])
  const sourceNodes = new Map(safeNodes.map(node => [node.id, node]))
  const elementBySource = new Map<string, BoardElement>()
  const nodes = safeNodes.map(node => {
    const style = palette[node.kind]
    const element: BoardElement = {
      id: uid(), type: style.type, x: origin.x + Math.max(0, Math.min(1400, node.x)), y: origin.y + Math.max(0, Math.min(1000, node.y)),
      width: Math.max(100, Math.min(260, node.width)), height: Math.max(54, Math.min(160, node.height)), rotation: 0,
      stroke: '#24463a', fill: style.fill, strokeWidth: 2, opacity: 1, label: node.label.slice(0, 100),
    }
    elementBySource.set(node.id, element)
    return element
  })
  const edges = plan.edges.slice(0, 50).flatMap(edge => {
    const fromNode = sourceNodes.get(edge.from), toNode = sourceNodes.get(edge.to)
    const from = elementBySource.get(edge.from), to = elementBySource.get(edge.to)
    if (!fromNode || !toNode || !from || !to || from.id === to.id) return []
    const [startSide, endSide] = sideToward(fromNode, toNode)
    const box = normalizedBox(anchor(from, startSide), anchor(to, endSide))
    const connector: BoardElement = {
      id: uid(), type: 'arrow', ...box, rotation: 0, stroke: '#47645a', fill: 'transparent', strokeWidth: 2, opacity: 1,
      label: typeof edge.label === 'string' ? edge.label.slice(0, 80) : '',
      startBinding: { elementId: from.id, side: startSide }, endBinding: { elementId: to.id, side: endSide },
    }
    return [connector]
  })
  return [...nodes, ...edges]
}

export async function requestDiagram(apiKey: string, prompt: string, model: string, signal?: AbortSignal): Promise<DiagramPlan> {
  const response = await fetch('/api/openai-diagram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OpenAI-Key': apiKey },
    body: JSON.stringify({ prompt, model }),
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'AI request failed.')
  return payload.diagram as DiagramPlan
}
