import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './openai-diagram.js'

const responseMock = () => ({
  statusCode: 200,
  body: undefined,
  headers: {},
  setHeader(name, value) { this.headers[name] = value },
  status(code) { this.statusCode = code; return this },
  json(payload) { this.body = payload; return this },
})

describe('OpenAI diagram proxy', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the Responses API with strict structured output and no response storage', async () => {
    const diagram = { title: 'API', nodes: [{ id: 'api', label: 'API', kind: 'service', x: 0, y: 0, width: 140, height: 70 }], edges: [] }
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(diagram) }] }] }) }))
    vi.stubGlobal('fetch', fetchMock)
    const response = responseMock()
    await handler({ method: 'POST', headers: { 'x-openai-key': 'sk-test-12345678901234567890' }, body: { prompt: 'Create an API', model: 'gpt-5.4-mini' } }, response)
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ diagram })
    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(init.headers.Authorization).toBe('Bearer sk-test-12345678901234567890')
    expect(body.store).toBe(false)
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'stillboard_diagram' })
  })

  it('rejects missing keys before contacting OpenAI', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = responseMock()
    await handler({ method: 'POST', headers: {}, body: { prompt: 'Create an API' } }, response)
    expect(response.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
