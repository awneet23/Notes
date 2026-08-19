import { normalizedBox } from './geometry'
import type { BoardDocument, BoardElement, ConnectionSide, Point } from './types'
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
export type AiMessage = { role: 'user' | 'assistant'; content: string }
export type BoardSnapshot = {
  name: string
  canvas: { background: string; pattern: string }
  selectedIds: string[]
  objects: Array<{ id: string; type: string; text?: string; x: number; y: number; width: number; height: number }>
  connections: Array<{ id: string; type: 'line' | 'arrow'; label?: string; from?: string; to?: string; x: number; y: number; endX: number; endY: number }>
  omitted: number
}

const palette: Record<DiagramNode['kind'], { type: BoardElement['type']; fill: string }> = {
  client: { type: 'rectangle', fill: '#deecff' }, service: { type: 'rectangle', fill: '#e4f3ef' },
  gateway: { type: 'diamond', fill: '#f0e6ff' }, database: { type: 'cylinder', fill: '#fbf3dc' },
  cache: { type: 'hexagon', fill: '#dff3e8' }, queue: { type: 'hexagon', fill: '#fff1a8' },
  storage: { type: 'cylinder', fill: '#e5eff9' }, cloud: { type: 'cloud', fill: '#eceff1' },
  note: { type: 'speech', fill: '#ffe4e4' },
}

const sideToward = (from: BoardElement, to: BoardElement): [ConnectionSide, ConnectionSide] => {
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

const graphLayers = (nodes: DiagramNode[], edges: DiagramEdge[]) => {
  const ids = new Set(nodes.map(node => node.id))
  const incoming = new Map(nodes.map(node => [node.id, 0]))
  const outgoing = new Map(nodes.map(node => [node.id, [] as string[]]))
  edges.forEach(edge => {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) return
    outgoing.get(edge.from)?.push(edge.to)
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
  })
  const layers = new Map(nodes.map(node => [node.id, 0]))
  const queue = nodes.filter(node => incoming.get(node.id) === 0).sort((a, b) => a.y - b.y)
  const visited = new Set<string>()
  while (queue.length) {
    const current = queue.shift()!
    if (visited.has(current.id)) continue
    visited.add(current.id)
    for (const target of outgoing.get(current.id) ?? []) {
      layers.set(target, Math.max(layers.get(target) ?? 0, (layers.get(current.id) ?? 0) + 1))
      incoming.set(target, (incoming.get(target) ?? 1) - 1)
      if (incoming.get(target) === 0) queue.push(nodes.find(node => node.id === target)!)
    }
  }
  const unresolved = nodes.filter(node => !visited.has(node.id)).sort((a, b) => a.x - b.x || a.y - b.y)
  unresolved.forEach((node, index) => layers.set(node.id, index % Math.max(1, Math.ceil(Math.sqrt(unresolved.length)))))
  return layers
}

export function diagramToElements(plan: DiagramPlan, origin: Point): BoardElement[] {
  const seen = new Set<string>()
  const safeNodes = plan.nodes.slice(0, 30).filter(node => {
    const valid = node && typeof node.id === 'string' && !seen.has(node.id) && typeof node.label === 'string' && palette[node.kind]
    if (valid) seen.add(node.id)
    return valid
  })
  const safeEdges = plan.edges.slice(0, 50).filter(edge => seen.has(edge.from) && seen.has(edge.to) && edge.from !== edge.to)
  const layers = graphLayers(safeNodes, safeEdges)
  const groups = new Map<number, DiagramNode[]>()
  safeNodes.forEach(node => {
    const layer = layers.get(node.id) ?? 0
    groups.set(layer, [...(groups.get(layer) ?? []), node])
  })
  groups.forEach(group => group.sort((a, b) => a.y - b.y || a.x - b.x))
  const maxRows = Math.max(1, ...[...groups.values()].map(group => group.length))
  const elementBySource = new Map<string, BoardElement>()
  const nodes: BoardElement[] = []
  ;[...groups.entries()].sort(([a], [b]) => a - b).forEach(([layer, group]) => {
    group.forEach((node, row) => {
      const style = palette[node.kind]
      const width = Math.max(120, Math.min(210, Number.isFinite(node.width) ? node.width : 160))
      const height = Math.max(62, Math.min(105, Number.isFinite(node.height) ? node.height : 74))
      const element: BoardElement = {
        id: uid(), type: style.type, x: origin.x + layer * 290, y: origin.y + (maxRows - group.length) * 70 + row * 140,
        width, height, rotation: 0, stroke: '#24463a', fill: style.fill, strokeWidth: 2, opacity: 1, label: node.label.slice(0, 100),
      }
      elementBySource.set(node.id, element)
      nodes.push(element)
    })
  })
  const connectors = safeEdges.flatMap(edge => {
    const from = elementBySource.get(edge.from), to = elementBySource.get(edge.to)
    if (!from || !to) return []
    const [startSide, endSide] = sideToward(from, to)
    const box = normalizedBox(anchor(from, startSide), anchor(to, endSide))
    return [{
      id: uid(), type: 'arrow' as const, ...box, rotation: 0, stroke: '#47645a', fill: 'transparent', strokeWidth: 2, opacity: 1,
      label: typeof edge.label === 'string' ? edge.label.slice(0, 80) : '',
      startBinding: { elementId: from.id, side: startSide }, endBinding: { elementId: to.id, side: endSide },
    }]
  })
  return [...nodes, ...connectors]
}

export function serializeBoardForAI(
  board: Pick<BoardDocument, 'name' | 'elements' | 'background' | 'canvasPattern'>,
  selectedIds: string[] = [],
): BoardSnapshot {
  const limit = 140
  const included = board.elements.slice(0, limit)
  const objects = included.filter(element => element.type !== 'line' && element.type !== 'arrow').map(element => ({
    id: element.id, type: element.type === 'pen' ? 'freehand drawing' : element.type,
    ...(element.label || element.text ? { text: (element.label || element.text)!.slice(0, 500) } : {}),
    x: Math.round(element.x), y: Math.round(element.y), width: Math.round(element.width), height: Math.round(element.height),
  }))
  const connections = included.filter((element): element is BoardElement & { type: 'line' | 'arrow' } => element.type === 'line' || element.type === 'arrow').map(element => ({
    id: element.id, type: element.type, ...(element.label ? { label: element.label.slice(0, 200) } : {}),
    ...(element.startBinding ? { from: element.startBinding.elementId } : {}), ...(element.endBinding ? { to: element.endBinding.elementId } : {}),
    x: Math.round(element.x), y: Math.round(element.y), endX: Math.round(element.x + element.width), endY: Math.round(element.y + element.height),
  }))
  return {
    name: board.name.slice(0, 200), canvas: { background: board.background ?? '#f8f7f3', pattern: board.canvasPattern ?? 'dots' },
    selectedIds: selectedIds.filter(id => included.some(element => element.id === id)).slice(0, 50),
    objects, connections, omitted: Math.max(0, board.elements.length - included.length),
  }
}

export async function requestDiagram(apiKey: string, prompt: string, model: string, signal?: AbortSignal): Promise<DiagramPlan> {
  const response = await fetch('/api/openai-diagram', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenAI-Key': apiKey },
    body: JSON.stringify({ mode: 'diagram', prompt, model }), signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'AI request failed.')
  return payload.diagram as DiagramPlan
}

export async function requestBoardChat(apiKey: string, question: string, board: BoardSnapshot, history: AiMessage[], model: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/openai-diagram', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OpenAI-Key': apiKey },
    body: JSON.stringify({ mode: 'chat', question, board, history: history.slice(-10), model }), signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'AI request failed.')
  if (typeof payload.answer !== 'string' || !payload.answer.trim()) throw new Error('OpenAI returned no answer.')
  return payload.answer.trim()
}
