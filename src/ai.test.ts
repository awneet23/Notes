import { describe, expect, it, vi } from 'vitest'
import { diagramToElements, requestBoardChat, requestDiagram, serializeBoardForAI, type DiagramPlan } from './ai'
import type { BoardElement } from './types'

const plan: DiagramPlan = {
  title: 'Small system',
  nodes: [
    { id: 'client', label: 'Web client', kind: 'client', x: 0, y: 20, width: 140, height: 70 },
    { id: 'api', label: 'API service', kind: 'service', x: 260, y: 20, width: 160, height: 70 },
  ],
  edges: [{ from: 'client', to: 'api', label: 'HTTPS' }],
}

describe('AI integration helpers', () => {
  it('creates native labeled shapes with collision-free layers and a bound connector', () => {
    const elements = diagramToElements(plan, { x: 100, y: 200 })
    expect(elements).toHaveLength(3)
    expect(elements[0]).toMatchObject({ type: 'rectangle', x: 100, y: 200, label: 'Web client' })
    expect(elements[1]).toMatchObject({ type: 'rectangle', x: 390, y: 200, label: 'API service' })
    expect(elements[2]).toMatchObject({ type: 'arrow', label: 'HTTPS', startBinding: { elementId: elements[0].id, side: 'right' }, endBinding: { elementId: elements[1].id, side: 'left' } })

    const overlappingPlan: DiagramPlan = {
      ...plan,
      nodes: [...plan.nodes, { id: 'worker', label: 'Worker', kind: 'service', x: 0, y: 20, width: 160, height: 70 }],
      edges: [...plan.edges, { from: 'client', to: 'worker', label: 'job' }],
    }
    const shapes = diagramToElements(overlappingPlan, { x: 0, y: 0 }).filter(element => element.type !== 'arrow')
    expect(new Set(shapes.map(element => `${element.x}:${element.y}`)).size).toBe(shapes.length)
  })

  it('serializes useful board structure while excluding raw pen points', () => {
    const elements: BoardElement[] = [
      { id: 'client', type: 'rectangle', x: 10, y: 20, width: 140, height: 70, rotation: 0, stroke: '#000', fill: '#fff', strokeWidth: 2, opacity: 1, label: 'Web app' },
      { id: 'api', type: 'rectangle', x: 280, y: 20, width: 140, height: 70, rotation: 0, stroke: '#000', fill: '#fff', strokeWidth: 2, opacity: 1, label: 'API' },
      { id: 'edge', type: 'arrow', x: 150, y: 55, width: 130, height: 0, rotation: 0, stroke: '#000', fill: 'transparent', strokeWidth: 2, opacity: 1, label: 'HTTPS', startBinding: { elementId: 'client', side: 'right' }, endBinding: { elementId: 'api', side: 'left' } },
      { id: 'pen', type: 'pen', x: 0, y: 0, width: 20, height: 20, rotation: 0, stroke: '#000', fill: 'transparent', strokeWidth: 2, opacity: 1, points: [{ x: 0, y: 0 }, { x: 20, y: 20 }] },
    ]
    const snapshot = serializeBoardForAI({ name: 'Architecture', elements, background: '#fff', canvasPattern: 'grid' }, ['api'])
    expect(snapshot.objects).toContainEqual(expect.objectContaining({ id: 'client', text: 'Web app' }))
    expect(snapshot.connections).toContainEqual(expect.objectContaining({ from: 'client', to: 'api', label: 'HTTPS' }))
    expect(JSON.stringify(snapshot)).not.toContain('points')
    expect(snapshot.selectedIds).toEqual(['api'])
  })

  it('sends keys only in headers and supports diagram and board-chat responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ diagram: plan }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ answer: 'The API is a single point of failure.' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'That API key was rejected by OpenAI.' }) })
    vi.stubGlobal('fetch', fetchMock)
    const key = 'sk-user-key-123456789012345'
    await expect(requestDiagram(key, 'Create an API', 'gpt-5.4-mini')).resolves.toEqual(plan)
    await expect(requestBoardChat(key, 'Review it', { name: 'Board', canvas: { background: '#fff', pattern: 'dots' }, selectedIds: [], objects: [], connections: [], omitted: 0 }, [], 'gpt-5.4-mini')).resolves.toContain('single point')
    const diagramInit = fetchMock.mock.calls[0][1]
    const chatInit = fetchMock.mock.calls[1][1]
    expect(diagramInit.headers['X-OpenAI-Key']).toBe(key)
    expect(diagramInit.body).not.toContain(key)
    expect(JSON.parse(chatInit.body)).toMatchObject({ mode: 'chat', question: 'Review it', board: { name: 'Board' } })
    await expect(requestDiagram('bad-key-but-long-enough-123', 'Create an API', 'gpt-5.4-mini')).rejects.toThrow('rejected')
    vi.unstubAllGlobals()
  })
})
