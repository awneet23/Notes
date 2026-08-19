export type Tool = 'select' | 'hand' | 'pen' | 'eraser' | 'text' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'diamond'

export type Point = { x: number; y: number }

export type BoardElement = {
  id: string
  type: 'pen' | 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'diamond' | 'text'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  stroke: string
  fill: string
  strokeWidth: number
  opacity: number
  points?: Point[]
  flipX?: boolean
  flipY?: boolean
  text?: string
  fontSize?: number
  fontFamily?: string
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
}

export type ViewState = { x: number; y: number; zoom: number }

export type BoardDocument = {
  id: string
  name: string
  elements: BoardElement[]
  view: ViewState
  background?: string
  createdAt: number
  updatedAt: number
  version: 1
}

export type NoteMeta = Pick<BoardDocument, 'id' | 'name' | 'createdAt' | 'updatedAt'>

export const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const DEFAULT_VIEW: ViewState = { x: 0, y: 0, zoom: 1 }
export const DEFAULT_BACKGROUND = '#f8f7f3'

export const newDocument = (name = 'Untitled board'): BoardDocument => ({
  id: uid(), name, elements: [], view: { ...DEFAULT_VIEW }, background: DEFAULT_BACKGROUND, createdAt: Date.now(), updatedAt: Date.now(), version: 1,
})
