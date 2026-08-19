import { describe, expect, it, vi } from 'vitest'
import { diagramToElements, requestDiagram, type DiagramPlan } from './ai'

const plan: DiagramPlan = {
  title: 'Small system',
  nodes: [
    { id: 'client', label: 'Web client', kind: 'client', x: 0, y: 20, width: 140, height: 70 },
    { id: 'api', label: 'API service', kind: 'service', x: 260, y: 20, width: 160, height: 70 },
  ],
  edges: [{ from: 'client', to: 'api', label: 'HTTPS' }],
}

describe('AI diagram conversion', () => {
  it('creates native labeled shapes and a bound connector', () => {
    const elements = diagramToElements(plan, { x: 100, y: 200 })
    expect(elements).toHaveLength(3)
    expect(elements[0]).toMatchObject({ type: 'rectangle', x: 100, y: 220, label: 'Web client' })
    expect(elements[1]).toMatchObject({ type: 'rectangle', x: 360, y: 220, label: 'API service' })
    expect(elements[2]).toMatchObject({ type: 'arrow', label: 'HTTPS', startBinding: { elementId: elements[0].id, side: 'right' }, endBinding: { elementId: elements[1].id, side: 'left' } })
  })

  it('sends the key only in the request header and surfaces safe API errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ diagram: plan }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'That API key was rejected by OpenAI.' }) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(requestDiagram('sk-user-key-123456789012345', 'Create an API', 'gpt-5.4-mini')).resolves.toEqual(plan)
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers['X-OpenAI-Key']).toBe('sk-user-key-123456789012345')
    expect(init.body).not.toContain('sk-user-key')
    await expect(requestDiagram('bad-key-but-long-enough-123', 'Create an API', 'gpt-5.4-mini')).rejects.toThrow('rejected')
    vi.unstubAllGlobals()
  })
})
