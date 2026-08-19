const ALLOWED_MODELS = new Set(['gpt-5.4-mini', 'gpt-5-mini'])
export const config = { maxDuration: 60 }

const diagramSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'nodes', 'edges'],
  properties: {
    title: { type: 'string' },
    nodes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'label', 'kind', 'x', 'y', 'width', 'height'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          kind: { type: 'string', enum: ['client', 'service', 'gateway', 'database', 'cache', 'queue', 'storage', 'cloud', 'note'] },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['from', 'to', 'label'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
  },
}

const instruction = `You design clear editable whiteboard diagrams. Return a concise diagram plan using the supplied schema.
Use unique node ids and only reference existing ids in edges. Lay nodes out left-to-right or top-to-bottom with generous spacing and no overlaps.
For system designs, include clients, entry points, core services, data stores, queues/caches where relevant, and directional request/data-flow edges.
Use short labels. Coordinates are relative canvas coordinates. Do not include markdown or commentary outside the schema.`

const parseBody = body => {
  if (typeof body === 'string') return JSON.parse(body)
  return body ?? {}
}

const outputText = response => response.output
  ?.flatMap(item => item.type === 'message' ? item.content ?? [] : [])
  .find(content => content.type === 'output_text')?.text

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })

  try {
    const apiKey = request.headers['x-openai-key']
    const body = parseBody(request.body)
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const model = ALLOWED_MODELS.has(body.model) ? body.model : 'gpt-5.4-mini'
    if (typeof apiKey !== 'string' || apiKey.length < 20 || apiKey.length > 300) return response.status(400).json({ error: 'Enter a valid OpenAI API key.' })
    if (!prompt || prompt.length > 4000) return response.status(400).json({ error: 'Describe a diagram in 1–4000 characters.' })

    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: 'low' },
        max_output_tokens: 6000,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: instruction }] },
          { role: 'user', content: [{ type: 'input_text', text: prompt }] },
        ],
        text: { format: { type: 'json_schema', name: 'stillboard_diagram', strict: true, schema: diagramSchema } },
      }),
    })
    const payload = await upstream.json()
    if (!upstream.ok) {
      const message = upstream.status === 401 ? 'That API key was rejected by OpenAI.' : payload?.error?.message || 'OpenAI could not generate this diagram.'
      return response.status(upstream.status >= 500 ? 502 : upstream.status).json({ error: message })
    }
    const text = outputText(payload)
    if (!text) return response.status(502).json({ error: 'OpenAI returned no diagram.' })
    const diagram = JSON.parse(text)
    if (!Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges) || !diagram.nodes.length || diagram.nodes.length > 30 || diagram.edges.length > 50) throw new Error('Invalid diagram')
    return response.status(200).json({ diagram })
  } catch {
    return response.status(500).json({ error: 'The AI request could not be completed.' })
  }
}
