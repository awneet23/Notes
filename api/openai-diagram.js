const ALLOWED_MODELS = new Set(['gpt-5.4-mini', 'gpt-5-mini'])
export const config = { maxDuration: 60 }

const diagramSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'nodes', 'edges'],
  properties: {
    title: { type: 'string' },
    nodes: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['id', 'label', 'kind', 'x', 'y', 'width', 'height'],
        properties: {
          id: { type: 'string' }, label: { type: 'string' },
          kind: { type: 'string', enum: ['client', 'service', 'gateway', 'database', 'cache', 'queue', 'storage', 'cloud', 'note'] },
          x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' },
        },
      },
    },
    edges: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['from', 'to', 'label'],
        properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' } },
      },
    },
  },
}

const diagramInstruction = `You create clear, editable whiteboard diagrams. Return only a concise plan matching the supplied schema.
Use 6-16 essential nodes unless the user explicitly asks for more. Use unique node ids and only reference existing ids in edges.
Prefer a clean left-to-right flow, short node labels, and short edge labels. Avoid duplicate components and unnecessary notes.
For system designs include clients, entry points, core services, and only the data stores, queues, caches, and workers that materially explain the design.
Coordinates are ordering hints only; the app performs final collision-free layout. Do not include markdown or commentary outside the schema.`

const chatInstruction = `You are Stillboard AI, a helpful design and whiteboard assistant. The user supplies a compact structural snapshot of their current board with objects, text, positions, selections, and bound connections.
Answer the user's question directly. You can review architecture, explain flows, find bottlenecks, suggest improvements, summarize, brainstorm, or answer general questions.
When the question concerns the board, ground the answer in specific labels and connections present in the snapshot. Never say you cannot see the board or ask for an uploaded image: you can inspect the supplied structural snapshot. If visual styling cannot be inferred from the snapshot, say exactly which visual detail is unavailable.
Clearly distinguish what is on the board from your recommendations. Be concise, practical, and use readable plain text or short bullets. Do not return JSON unless the user asks for JSON.`

const parseBody = body => typeof body === 'string' ? JSON.parse(body) : body ?? {}
const outputText = result => result.output
  ?.flatMap(item => item.type === 'message' ? item.content ?? [] : [])
  .filter(content => content.type === 'output_text')
  .map(content => content.text)
  .join('\n')
  .trim()

const validHistory = history => Array.isArray(history) ? history.slice(-10).flatMap(message => {
  if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return []
  const content = message.content.trim().slice(0, 4000)
  return content ? [{ role: message.role, content }] : []
}) : []

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })

  try {
    const apiKey = request.headers['x-openai-key']
    const body = parseBody(request.body)
    const mode = body.mode === 'chat' ? 'chat' : 'diagram'
    const model = ALLOWED_MODELS.has(body.model) ? body.model : 'gpt-5.4-mini'
    if (typeof apiKey !== 'string' || apiKey.length < 20 || apiKey.length > 300) return response.status(400).json({ error: 'Enter a valid OpenAI API key.' })

    let upstreamBody
    if (mode === 'chat') {
      const question = typeof body.question === 'string' ? body.question.trim() : ''
      const serializedBoard = JSON.stringify(body.board ?? {})
      if (!question || question.length > 4000) return response.status(400).json({ error: 'Ask a question in 1–4000 characters.' })
      if (serializedBoard.length > 80000) return response.status(413).json({ error: 'This board is too large to review at once.' })
      upstreamBody = {
        model, store: false, reasoning: { effort: 'low' }, max_output_tokens: 2500,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: chatInstruction }] },
          ...validHistory(body.history),
          { role: 'user', content: [{ type: 'input_text', text: `CURRENT BOARD SNAPSHOT\n${serializedBoard}\n\nCURRENT QUESTION\n${question}` }] },
        ],
        text: { verbosity: 'medium' },
      }
    } else {
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
      if (!prompt || prompt.length > 4000) return response.status(400).json({ error: 'Describe a diagram in 1–4000 characters.' })
      upstreamBody = {
        model, store: false, reasoning: { effort: 'low' }, max_output_tokens: 6000,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: diagramInstruction }] },
          { role: 'user', content: [{ type: 'input_text', text: prompt }] },
        ],
        text: { format: { type: 'json_schema', name: 'stillboard_diagram', strict: true, schema: diagramSchema } },
      }
    }

    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(upstreamBody),
    })
    const payload = await upstream.json()
    if (!upstream.ok) {
      const fallback = mode === 'chat' ? 'OpenAI could not answer that question.' : 'OpenAI could not generate this diagram.'
      const message = upstream.status === 401 ? 'That API key was rejected by OpenAI.' : payload?.error?.message || fallback
      return response.status(upstream.status >= 500 ? 502 : upstream.status).json({ error: message })
    }
    const text = outputText(payload)
    if (!text) return response.status(502).json({ error: mode === 'chat' ? 'OpenAI returned no answer.' : 'OpenAI returned no diagram.' })
    if (mode === 'chat') return response.status(200).json({ answer: text })
    const diagram = JSON.parse(text)
    if (!Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges) || !diagram.nodes.length || diagram.nodes.length > 30 || diagram.edges.length > 50) throw new Error('Invalid diagram')
    return response.status(200).json({ diagram })
  } catch {
    return response.status(500).json({ error: 'The AI request could not be completed.' })
  }
}
