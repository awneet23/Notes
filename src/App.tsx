import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Bold, BoxSelect, Check, ChevronDown, Circle, Cloud, Copy, Cylinder, Database, Diamond, Download, Eraser,
  FileJson, Flag, Focus, FolderOpen, Hand, Heart, Hexagon, House, Italic, Lightbulb, Menu, MessageSquare, MousePointer2, Pencil, Pentagon, Plus, Redo2,
  Save, Shapes, Slash, Square, Star, Trash2, Triangle, Type, Undo2, UserRound, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import type { BoardDocument, BoardElement, NoteMeta, Point, Tool, ViewState } from './types'
import { DEFAULT_BACKGROUND, DEFAULT_VIEW, newDocument, uid } from './types'
import { boundsOf, normalizedBox, pointsToElement, recognizeStroke, smoothPath } from './geometry'
import { deleteDocument, getDocument, listDocuments, saveDocument } from './db'
import { exportPng, exportProject, exportSvg } from './export'
import { extendedShapePath, ICON_PATHS, type ExtendedShape } from './vectorLibrary'

const COLORS = ['#1e2522', '#e05252', '#dc7d26', '#d1a617', '#3b8b65', '#3178c6', '#7357bd', '#f2f2ee']
const FILLS = ['transparent', '#fff1a8', '#dff3e8', '#deecff', '#f0e6ff', '#ffe4e4']
const CANVAS_BACKGROUNDS = ['#f8f7f3', '#ffffff', '#f6f0df', '#eaf3ed', '#eaf1f8', '#f2ecf7', '#242a27']
const TOOL_ITEMS: { tool: Tool; label: string; key: string; icon: typeof MousePointer2 }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: MousePointer2 },
  { tool: 'hand', label: 'Hand', key: 'H', icon: Hand },
  { tool: 'pen', label: 'Pen', key: 'P', icon: Pencil },
  { tool: 'eraser', label: 'Eraser', key: 'E', icon: Eraser },
  { tool: 'text', label: 'Text', key: 'T', icon: Type },
  { tool: 'line', label: 'Line', key: 'L', icon: Slash },
  { tool: 'arrow', label: 'Arrow', key: 'A', icon: ArrowRight },
]
const SHAPE_ITEMS: { tool: Tool; label: string; icon: typeof Square }[] = [
  { tool: 'rectangle', label: 'Rectangle', icon: Square }, { tool: 'ellipse', label: 'Ellipse', icon: Circle },
  { tool: 'diamond', label: 'Diamond', icon: Diamond }, { tool: 'triangle', label: 'Triangle', icon: Triangle },
  { tool: 'pentagon', label: 'Pentagon', icon: Pentagon }, { tool: 'hexagon', label: 'Hexagon', icon: Hexagon },
  { tool: 'star', label: 'Star', icon: Star }, { tool: 'cloud', label: 'Cloud', icon: Cloud },
  { tool: 'cylinder', label: 'Cylinder', icon: Cylinder }, { tool: 'speech', label: 'Speech bubble', icon: MessageSquare },
]
const ICON_ITEMS: { name: string; label: string; icon: typeof Check }[] = [
  { name: 'check', label: 'Check', icon: Check }, { name: 'cross', label: 'Cross', icon: X },
  { name: 'heart', label: 'Heart', icon: Heart }, { name: 'idea', label: 'Idea', icon: Lightbulb },
  { name: 'person', label: 'Person', icon: UserRound }, { name: 'home', label: 'Home', icon: House },
  { name: 'database', label: 'Database', icon: Database }, { name: 'flag', label: 'Flag', icon: Flag },
]
const LIBRARY_TOOLS: Tool[] = [...SHAPE_ITEMS.map(item => item.tool), 'icon']

type Interaction =
  | { type: 'pan'; start: Point; view: ViewState }
  | { type: 'draw'; points: Point[] }
  | { type: 'shape'; start: Point; current: Point; tool: Tool }
  | { type: 'move'; start: Point; initial: BoardElement[]; ids: string[] }
  | { type: 'marquee'; start: Point; current: Point }
  | { type: 'resize'; start: Point; initial: BoardElement[]; ids: string[]; bounds: { x: number; y: number; width: number; height: number }; corner: string }
  | { type: 'rotate'; center: Point; startAngle: number; initial: BoardElement[]; ids: string[] }
  | null

type TextEdit = { id?: string; x: number; y: number; value: string; caret?: number }

const cloneElements = (els: BoardElement[]) => els.map(el => ({ ...el, points: el.points?.map(p => ({ ...p })) }))
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const textDimensions = (value: string, size: number) => {
  const lines = value.split('\n')
  const longest = Math.max(0, ...lines.map(line => line.length))
  return { width: Math.max(3, longest * size * .62 + 2), height: Math.max(size * 1.3, lines.length * size * 1.3) }
}

const textCaretFromPoint = (el: BoardElement, point: Point) => {
  const value = el.text ?? ''
  const lines = value.split('\n')
  const size = el.fontSize ?? 22
  const center = { x: el.x + el.width / 2, y: el.y + el.height / 2 }
  const angle = -el.rotation * Math.PI / 180
  const dx = point.x - center.x, dy = point.y - center.y
  const local = {
    x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle) - el.x,
    y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle) - el.y,
  }
  const lineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(local.y / (size * 1.25))))
  const line = lines[lineIndex] ?? ''
  const charWidth = size * .62
  const lineWidth = line.length * charWidth
  const lineStart = el.align === 'center' ? (el.width - lineWidth) / 2 : el.align === 'right' ? el.width - lineWidth : 0
  const character = Math.max(0, Math.min(line.length, Math.round((local.x - lineStart) / charWidth)))
  return lines.slice(0, lineIndex).reduce((total, current) => total + current.length + 1, 0) + character
}

function App() {
  const [ready, setReady] = useState(false)
  const [currentId, setCurrentId] = useState('')
  const [name, setName] = useState('Untitled board')
  const [elements, setElements] = useState<BoardElement[]>([])
  const [view, setView] = useState<ViewState>({ ...DEFAULT_VIEW })
  const [background, setBackground] = useState(DEFAULT_BACKGROUND)
  const [tool, setTool] = useState<Tool>('select')
  const [selected, setSelected] = useState<string[]>([])
  const [interaction, setInteraction] = useState<Interaction>(null)
  const interactionRef = useRef<Interaction>(null)
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [notesOpen, setNotesOpen] = useState(false)
  const [fileOpen, setFileOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [selectedIcon, setSelectedIcon] = useState('check')
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [stroke, setStroke] = useState('#1e2522')
  const [fill, setFill] = useState('transparent')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [fontSize, setFontSize] = useState(22)
  const [fontFamily, setFontFamily] = useState('Inter, system-ui, sans-serif')
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('left')
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const historyRef = useRef<BoardElement[][]>([])
  const futureRef = useRef<BoardElement[][]>([])
  const initRef = useRef(false)
  const createdAtRef = useRef(Date.now())
  const skipSaveRef = useRef(true)
  const saveTimerRef = useRef<number | null>(null)

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }, [])

  const refreshNotes = useCallback(async () => setNotes(await listDocuments()), [])

  const loadDoc = useCallback(async (doc: BoardDocument, restored = false) => {
    skipSaveRef.current = true
    setCurrentId(doc.id); setName(doc.name); setElements(doc.elements ?? []); setView(doc.view ?? { ...DEFAULT_VIEW }); setBackground(doc.background ?? DEFAULT_BACKGROUND)
    createdAtRef.current = doc.createdAt ?? Date.now()
    historyRef.current = []; futureRef.current = []; setSelected([]); setTextEdit(null); setStatus('saved')
    localStorage.setItem('stillboard:last-note', doc.id)
    window.setTimeout(() => { skipSaveRef.current = false }, 0)
    if (restored) showToast('Restored from this device')
  }, [showToast])

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    ;(async () => {
      let all = await listDocuments()
      let doc: BoardDocument | undefined
      const lastId = localStorage.getItem('stillboard:last-note')
      if (lastId) doc = await getDocument(lastId)
      if (!doc && all[0]) doc = await getDocument(all[0].id)
      if (!doc) { doc = newDocument('My first board'); await saveDocument(doc); all = await listDocuments() }
      await loadDoc(doc, Boolean(doc.elements.length))
      setNotes(all); setReady(true)
    })().catch(() => { setReady(true); setStatus('unsaved') })
  }, [loadDoc])

  const currentDocument = useCallback((): BoardDocument => ({
    id: currentId, name, elements, view, background, version: 1, createdAt: createdAtRef.current, updatedAt: Date.now(),
  }), [currentId, name, elements, view, background])

  useEffect(() => {
    if (!ready || !currentId || skipSaveRef.current) return
    setStatus('unsaved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(async () => {
      setStatus('saving')
      try { await saveDocument(currentDocument()); setStatus('saved'); await refreshNotes() }
      catch { setStatus('unsaved') }
    }, 650)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [elements, name, view, background, ready, currentId, currentDocument, refreshNotes])

  const pushHistory = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-99), cloneElements(elements)]
    futureRef.current = []
  }, [elements])

  const commit = useCallback((next: BoardElement[] | ((prev: BoardElement[]) => BoardElement[])) => {
    pushHistory()
    setElements(prev => typeof next === 'function' ? next(prev) : next)
  }, [pushHistory])

  const undo = useCallback(() => {
    const previous = historyRef.current.pop(); if (!previous) return
    futureRef.current.push(cloneElements(elements)); setElements(previous); setSelected([])
  }, [elements])

  const redo = useCallback(() => {
    const next = futureRef.current.pop(); if (!next) return
    historyRef.current.push(cloneElements(elements)); setElements(next); setSelected([])
  }, [elements])

  const deleteSelection = useCallback(() => {
    if (!selected.length) return
    commit(prev => prev.filter(el => !selected.includes(el.id))); setSelected([])
  }, [selected, commit])

  const worldPoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 }
    return { x: (clientX - rect.left - view.x) / view.zoom, y: (clientY - rect.top - view.y) / view.zoom }
  }, [view])

  const makeShape = useCallback((shapeTool: Tool, a: Point, b: Point, constrain: boolean): BoardElement => {
    const box = normalizedBox(a, b, constrain)
    return {
      id: uid(), type: shapeTool as BoardElement['type'], x: box.x, y: box.y, width: box.width, height: box.height,
      rotation: 0, stroke, fill: shapeTool === 'line' || shapeTool === 'arrow' || shapeTool === 'icon' ? 'transparent' : fill,
      strokeWidth, opacity: 1, flipX: box.flipX, flipY: box.flipY, ...(shapeTool === 'icon' ? { iconName: selectedIcon } : {}),
    }
  }, [stroke, fill, strokeWidth, selectedIcon])

  const beginText = useCallback((p: Point, el?: BoardElement, caret?: number) => {
    if (el) {
      setFontSize(el.fontSize ?? 22); setFontFamily(el.fontFamily ?? fontFamily); setBold(Boolean(el.bold)); setItalic(Boolean(el.italic)); setAlign(el.align ?? 'left'); setStroke(el.stroke)
      setTextEdit({ id: el.id, x: el.x, y: el.y, value: el.text ?? '', caret }); setSelected([el.id])
    } else { setTextEdit({ x: p.x, y: p.y, value: '' }); setSelected([]) }
  }, [fontFamily])

  const finishText = useCallback(() => {
    if (!textEdit) return
    const value = textEdit.value.trimEnd()
    const dimensions = textDimensions(value, fontSize)
    if (textEdit.id) {
      const original = elements.find(el => el.id === textEdit.id)
      if (original && !value) {
        commit(prev => prev.filter(el => el.id !== textEdit.id))
        setSelected([])
      } else if (original && value !== original.text) {
        commit(prev => prev.map(el => el.id === textEdit.id ? { ...el, text: value, width: dimensions.width, height: dimensions.height, fontSize, fontFamily, bold, italic, align, stroke } : el))
      }
    } else if (value) {
      const el: BoardElement = { id: uid(), type: 'text', x: textEdit.x, y: textEdit.y, width: dimensions.width, height: dimensions.height, rotation: 0, stroke, fill: 'transparent', strokeWidth: 1, opacity: 1, text: value, fontSize, fontFamily, bold, italic, align }
      commit(prev => [...prev, el]); setSelected([el.id])
    }
    // Keep the currently chosen tool active. When Text opened this editor it
    // stays sticky, while editing existing text from Select naturally remains
    // in Select mode.
    setTextEdit(null)
  }, [textEdit, elements, commit, fontSize, fontFamily, bold, italic, align, stroke])

  useLayoutEffect(() => {
    if (!textEdit) return
    const frame = requestAnimationFrame(() => {
      const editor = textAreaRef.current
      if (!editor) return
      editor.focus({ preventScroll: true })
      const caret = Math.max(0, Math.min(editor.value.length, textEdit.caret ?? editor.value.length))
      editor.setSelectionRange(caret, caret)
    })
    return () => cancelAnimationFrame(frame)
  }, [textEdit?.id, textEdit?.x, textEdit?.y, textEdit?.caret])

  const setInteractionBoth = (next: Interaction) => { interactionRef.current = next; setInteraction(next) }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return
    if (libraryOpen) setLibraryOpen(false)
    const target = (e.target as Element).closest?.('[data-element-id]') as SVGElement | null
    const hitId = target?.dataset.elementId
    const hitElement = elements.find(el => el.id === hitId)
    const p = worldPoint(e.clientX, e.clientY)
    if (tool === 'text') {
      // Prevent the canvas pointer-down default from stealing focus after the
      // editor mounts. Text interactions do not need pointer capture.
      e.preventDefault()
      // A second canvas click commits the current text before opening the next
      // editor, so sticky Text mode can be used for several labels in a row.
      if (textEdit) finishText()
      if (hitElement?.type === 'text') beginText(p, hitElement, textCaretFromPoint(hitElement, p))
      else beginText(p)
      return
    }
    svgRef.current?.setPointerCapture(e.pointerId)
    if (e.button === 1 || tool === 'hand' || spaceDown) {
      setInteractionBoth({ type: 'pan', start: { x: e.clientX, y: e.clientY }, view: { ...view } }); return
    }
    if (tool === 'eraser') {
      // Start one undoable eraser gesture even when the drag begins in empty
      // space and only reaches an element later.
      pushHistory()
      if (hitId) { setElements(prev => prev.filter(el => el.id !== hitId)); setSelected(prev => prev.filter(id => id !== hitId)) }
      return
    }
    if (tool === 'pen') { setInteractionBoth({ type: 'draw', points: [p] }); return }
    if (['line', 'arrow', ...LIBRARY_TOOLS].includes(tool)) { setInteractionBoth({ type: 'shape', start: p, current: p, tool }); return }
    if (tool === 'select') {
      if (hitId) {
        if (e.shiftKey) {
          setSelected(prev => prev.includes(hitId) ? prev.filter(id => id !== hitId) : [...prev, hitId]); return
        }
        const ids = selected.includes(hitId) ? selected : [hitId]
        setSelected(ids); pushHistory()
        setInteractionBoth({ type: 'move', start: p, initial: cloneElements(elements), ids }); return
      }
      setSelected([]); setInteractionBoth({ type: 'marquee', start: p, current: p })
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const active = interactionRef.current
    if (!active) {
      if (tool === 'eraser' && e.buttons === 1) {
        const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-element-id]') as SVGElement | null
        if (under?.dataset.elementId) setElements(prev => prev.filter(el => el.id !== under.dataset.elementId))
      }
      return
    }
    if (active.type === 'pan') {
      setView({ ...active.view, x: active.view.x + e.clientX - active.start.x, y: active.view.y + e.clientY - active.start.y }); return
    }
    const p = worldPoint(e.clientX, e.clientY)
    if (active.type === 'draw') {
      const last = active.points[active.points.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) > .8 / view.zoom) {
        active.points.push(p); setInteraction({ ...active, points: [...active.points] })
      }
    } else if (active.type === 'shape' || active.type === 'marquee') {
      active.current = p; setInteraction({ ...active })
    } else if (active.type === 'move') {
      const dx = p.x - active.start.x, dy = p.y - active.start.y
      setElements(active.initial.map(el => active.ids.includes(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el))
    } else if (active.type === 'resize') {
      const b = active.bounds
      const left = active.corner.includes('w') ? Math.min(p.x, b.x + b.width - 5) : b.x
      const top = active.corner.includes('n') ? Math.min(p.y, b.y + b.height - 5) : b.y
      const right = active.corner.includes('e') ? Math.max(p.x, b.x + 5) : b.x + b.width
      const bottom = active.corner.includes('s') ? Math.max(p.y, b.y + 5) : b.y + b.height
      const sx = (right - left) / Math.max(b.width, 1), sy = (bottom - top) / Math.max(b.height, 1)
      setElements(active.initial.map(el => active.ids.includes(el.id) ? {
        ...el,
        x: left + (el.x - b.x) * sx,
        y: top + (el.y - b.y) * sy,
        width: Math.max(5, el.width * sx),
        height: Math.max(5, el.height * sy),
        ...(el.type === 'text' ? { fontSize: Math.max(8, (el.fontSize ?? 22) * sy) } : {}),
      } : el))
    } else if (active.type === 'rotate') {
      const angle = Math.atan2(p.y - active.center.y, p.x - active.center.x) * 180 / Math.PI
      const delta = angle - active.startAngle
      const rad = delta * Math.PI / 180
      setElements(active.initial.map(el => {
        if (!active.ids.includes(el.id)) return el
        const cx = el.x + el.width / 2, cy = el.y + el.height / 2
        const dx = cx - active.center.x, dy = cy - active.center.y
        const nx = active.center.x + dx * Math.cos(rad) - dy * Math.sin(rad)
        const ny = active.center.y + dx * Math.sin(rad) + dy * Math.cos(rad)
        return { ...el, x: nx - el.width / 2, y: ny - el.height / 2, rotation: el.rotation + delta }
      }))
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const active = interactionRef.current
    if (!active) return
    if (active.type === 'draw' && active.points.length) {
      const recognized = e.shiftKey ? recognizeStroke(active.points) : null
      if (recognized) {
        const el = makeShape(recognized, active.points[0], active.points[active.points.length - 1], false)
        if (recognized !== 'line') {
          const box = normalizedBox({ x: Math.min(...active.points.map(p => p.x)), y: Math.min(...active.points.map(p => p.y)) }, { x: Math.max(...active.points.map(p => p.x)), y: Math.max(...active.points.map(p => p.y)) })
          Object.assign(el, box)
        }
        commit(prev => [...prev, el]); setSelected([el.id])
      } else {
        const el = pointsToElement(active.points, { id: uid(), type: 'pen', rotation: 0, stroke, fill: 'transparent', strokeWidth, opacity: 1 })
        commit(prev => [...prev, el]); setSelected([el.id])
      }
    } else if (active.type === 'shape') {
      const distance = Math.hypot(active.current.x - active.start.x, active.current.y - active.start.y)
      const current = distance < 4 / view.zoom ? { x: active.start.x + (active.tool === 'icon' ? 64 : 100), y: active.start.y + (active.tool === 'icon' ? 64 : 70) } : active.current
      const el = makeShape(active.tool, active.start, current, e.shiftKey || active.tool === 'icon')
      commit(prev => [...prev, el]); setSelected([el.id]); setTool('select')
    } else if (active.type === 'marquee') {
      const b = normalizedBox(active.start, active.current)
      setSelected(elements.filter(el => el.x < b.x + b.width && el.x + el.width > b.x && el.y < b.y + b.height && el.y + el.height > b.y).map(el => el.id))
    }
    setInteractionBoth(null)
  }

  const beginResize = (e: React.PointerEvent, corner: string) => {
    e.stopPropagation(); const chosen = elements.filter(el => selected.includes(el.id)); const b = boundsOf(chosen); if (!b) return
    pushHistory(); const active: Interaction = { type: 'resize', start: worldPoint(e.clientX, e.clientY), initial: cloneElements(elements), ids: [...selected], bounds: b, corner }
    setInteractionBoth(active); svgRef.current?.setPointerCapture(e.pointerId)
  }

  const beginRotate = (e: React.PointerEvent) => {
    e.stopPropagation(); const b = boundsOf(elements.filter(el => selected.includes(el.id))); if (!b) return
    const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, p = worldPoint(e.clientX, e.clientY)
    pushHistory(); setInteractionBoth({ type: 'rotate', center, startAngle: Math.atan2(p.y - center.y, p.x - center.x) * 180 / Math.PI, initial: cloneElements(elements), ids: [...selected] }); svgRef.current?.setPointerCapture(e.pointerId)
  }

  const zoomAt = useCallback((nextZoom: number, client?: Point) => {
    const svg = svgRef.current; if (!svg) return
    const z = Math.min(4, Math.max(.1, nextZoom)); const rect = svg.getBoundingClientRect(); const c = client ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const wx = (c.x - rect.left - view.x) / view.zoom, wy = (c.y - rect.top - view.y) / view.zoom
    setView({ x: c.x - rect.left - wx * z, y: c.y - rect.top - wy * z, zoom: z })
  }, [view])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) zoomAt(view.zoom * Math.exp(-e.deltaY * .002), { x: e.clientX, y: e.clientY })
    else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
  }

  const fitCanvas = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect(); const b = boundsOf(elements)
    if (!rect || !b) { setView({ ...DEFAULT_VIEW, x: rect?.width ? rect.width / 2 : 0, y: rect?.height ? rect.height / 2 : 0 }); return }
    const zoom = Math.min(1.5, Math.max(.1, Math.min((rect.width - 160) / Math.max(b.width, 1), (rect.height - 160) / Math.max(b.height, 1))))
    setView({ zoom, x: rect.width / 2 - (b.x + b.width / 2) * zoom, y: rect.height / 2 - (b.y + b.height / 2) * zoom })
  }, [elements])

  const applyStyle = (changes: Partial<BoardElement>) => {
    if (selected.length) commit(prev => prev.map(el => selected.includes(el.id) ? { ...el, ...changes } : el))
  }

  const manualSave = async () => { setStatus('saving'); await saveDocument(currentDocument()); setStatus('saved'); await refreshNotes(); showToast('Saved locally on this device') }

  const switchNote = async (id: string) => {
    if (id === currentId) { setNotesOpen(false); return }
    await saveDocument(currentDocument()); const doc = await getDocument(id); if (doc) await loadDoc(doc); setNotesOpen(false); await refreshNotes()
  }

  const createNote = async () => { await saveDocument(currentDocument()); const doc = newDocument(`Untitled board ${notes.length + 1}`); await saveDocument(doc); await loadDoc(doc); await refreshNotes(); setNotesOpen(false); showToast('New local board created') }
  const duplicateNote = async (meta: NoteMeta) => { const source = await getDocument(meta.id); if (!source) return; const copy = { ...source, id: uid(), name: `${source.name} copy`, createdAt: Date.now(), updatedAt: Date.now(), elements: cloneElements(source.elements) }; await saveDocument(copy); await refreshNotes(); showToast('Board duplicated') }
  const renameNote = async (meta: NoteMeta) => {
    const nextName = prompt('Rename this board', meta.name)?.trim()
    if (!nextName || nextName === meta.name) return
    const doc = await getDocument(meta.id); if (!doc) return
    await saveDocument({ ...doc, name: nextName, updatedAt: Date.now() })
    if (meta.id === currentId) { skipSaveRef.current = true; setName(nextName); window.setTimeout(() => { skipSaveRef.current = false }, 0) }
    await refreshNotes(); showToast('Board renamed')
  }
  const removeNote = async (meta: NoteMeta) => {
    if (!confirm(`Delete “${meta.name}” from this device?`)) return
    await deleteDocument(meta.id)
    if (meta.id === currentId) { const rest = await listDocuments(); const next = rest[0] ? await getDocument(rest[0].id) : newDocument('Untitled board'); if (next) { await saveDocument(next); await loadDoc(next) } }
    await refreshNotes(); showToast('Board deleted')
  }

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as BoardDocument
      if (!Array.isArray(parsed.elements)) throw new Error('Invalid project')
      const doc: BoardDocument = { ...parsed, id: uid(), name: parsed.name ? `${parsed.name} (imported)` : file.name.replace(/\.(stillboard|json)$/i, ''), version: 1, createdAt: Date.now(), updatedAt: Date.now(), view: parsed.view ?? { ...DEFAULT_VIEW }, background: parsed.background ?? DEFAULT_BACKGROUND }
      await saveDocument(currentDocument()); await saveDocument(doc); await loadDoc(doc); await refreshNotes(); showToast('Project imported locally')
    } catch { showToast('That file is not a valid Stillboard project') }
    if (importRef.current) importRef.current.value = ''
  }

  const exportElements = selected.length ? elements.filter(el => selected.includes(el.id)) : elements

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const eventTarget = e.target as HTMLElement
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(eventTarget.tagName) || eventTarget.isContentEditable
      // textEdit is an additional guard for the brief interval between the
      // editor being created and the browser assigning it focus.
      if (editing || textEdit) return
      if (e.code === 'Space') { e.preventDefault(); setSpaceDown(true) }
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); manualSave(); return }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelected(elements.map(el => el.id)); setTool('select'); return }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return }
      if (e.key === 'Escape') { setSelected([]); setTextEdit(null); setLibraryOpen(false); setInteractionBoth(null); return }
      const found = TOOL_ITEMS.find(item => item.key.toLowerCase() === e.key.toLowerCase())
      const shapeShortcut = ({ r: 'rectangle', o: 'ellipse', d: 'diamond' } as Record<string, Tool>)[e.key.toLowerCase()]
      if (found && !e.ctrlKey && !e.metaKey) { setTool(found.tool); setLibraryOpen(false) }
      else if (shapeShortcut && !e.ctrlKey && !e.metaKey) { setTool(shapeShortcut); setLibraryOpen(false) }
      if ((e.key === '+' || e.key === '=') && !e.ctrlKey) zoomAt(view.zoom * 1.15)
      if (e.key === '-' && !e.ctrlKey) zoomAt(view.zoom / 1.15)
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false) }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [undo, redo, deleteSelection, elements, view.zoom, zoomAt, textEdit])

  const selectedElements = useMemo(() => elements.filter(el => selected.includes(el.id)), [elements, selected])
  const selectionBounds = useMemo(() => boundsOf(selectedElements), [selectedElements])
  const draftShape = interaction?.type === 'shape' ? makeShape(interaction.tool, interaction.start, interaction.current, false) : null
  const editorDimensions = textEdit ? textDimensions(textEdit.value, fontSize) : null
  const gridColor = background === '#242a27' ? '#515a55' : '#d8d7d1'

  if (!ready) return <div className="loading"><div className="brand-mark">S</div><span>Opening your local boards…</span></div>

  return (
    <main className={`app tool-${tool} ${spaceDown ? 'space-pan' : ''}`}>
      <header className="topbar">
        <div className="brand" aria-label="Stillboard"><span className="brand-mark">S</span><span>Stillboard</span></div>
        <button className="board-title" onClick={() => setNotesOpen(v => !v)} aria-label="Open board switcher">
          <span>{name}</span><ChevronDown size={14}/>
        </button>
        <div className={`save-status ${status}`}><span className="status-dot"/>{status === 'saved' ? 'Saved locally' : status === 'saving' ? 'Saving…' : 'Unsaved changes'}</div>
        <div className="top-actions">
          <button className="icon-button" onClick={undo} disabled={!historyRef.current.length} aria-label="Undo" title="Undo"><Undo2 size={18}/></button>
          <button className="icon-button" onClick={redo} disabled={!futureRef.current.length} aria-label="Redo" title="Redo"><Redo2 size={18}/></button>
          <button className="file-button" onClick={() => setFileOpen(v => !v)} aria-label="File menu"><Menu size={17}/><span>File</span></button>
        </div>
      </header>

      {notesOpen && <div className="popover notes-popover">
        <div className="popover-head"><div><strong>Your boards</strong><small>Only on this device</small></div><button className="new-note" onClick={createNote}><Plus size={15}/> New</button></div>
        <div className="note-list">{notes.map(note => <div className={`note-row ${note.id === currentId ? 'active' : ''}`} key={note.id}>
          <button className="note-main" onClick={() => switchNote(note.id)}><span className="note-thumb"><BoxSelect size={18}/></span><span><strong>{note.name}</strong><small>{new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span>{note.id === currentId && <Check size={16}/>}</button>
          <button className="row-action" onClick={() => renameNote(note)} title="Rename"><Pencil size={14}/></button>
          <button className="row-action" onClick={() => duplicateNote(note)} title="Duplicate"><Copy size={15}/></button>
          <button className="row-action danger" onClick={() => removeNote(note)} title="Delete"><Trash2 size={15}/></button>
        </div>)}</div>
        <div className="privacy-note">Your drawings never leave this browser.</div>
      </div>}

      {fileOpen && <div className="popover file-popover">
        <button onClick={() => { manualSave(); setFileOpen(false) }}><Save size={17}/><span><strong>Save locally</strong><small>Update browser autosave</small></span></button>
        <button onClick={() => { exportProject(currentDocument()); setFileOpen(false) }}><FileJson size={17}/><span><strong>Save project file</strong><small>Editable .stillboard file</small></span></button>
        <button onClick={() => { importRef.current?.click(); setFileOpen(false) }}><FolderOpen size={17}/><span><strong>Open project file</strong><small>Import from your computer</small></span></button>
        <div className="menu-separator"/>
        <button onClick={() => { exportPng(exportElements, name, background); setFileOpen(false) }}><Download size={17}/><span><strong>Export PNG</strong><small>{selected.length ? 'Selected objects' : 'Entire board'}</small></span></button>
        <button onClick={() => { exportSvg(exportElements, name, background); setFileOpen(false) }}><Download size={17}/><span><strong>Export SVG</strong><small>{selected.length ? 'Selected objects' : 'Editable vectors'}</small></span></button>
      </div>}

      <input ref={importRef} hidden type="file" accept=".stillboard,.json,application/json" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])}/>

      <nav className="toolbar" aria-label="Drawing tools">
        {TOOL_ITEMS.map(({ tool: item, label, key, icon: Icon }, index) => <div key={item} className={index === 4 || index === 5 ? 'tool-divider-before' : ''}>
          <button className={tool === item ? 'active' : ''} onClick={() => { setTool(item); setLibraryOpen(false); if (item !== 'select') setSelected([]) }} aria-label={`${label} tool`} title={`${label} (${key})`}><Icon size={19}/><kbd>{key}</kbd></button>
        </div>)}
        <div className="tool-divider-before library-tool"><button className={LIBRARY_TOOLS.includes(tool) ? 'active' : ''} onClick={() => setLibraryOpen(open => !open)} aria-label="Shapes and icons" title="Shapes and icons (R / O / D)"><Shapes size={20}/><ChevronDown className="tool-chevron" size={10}/></button></div>
      </nav>

      {libraryOpen && <div className="popover shape-library" role="dialog" aria-label="Shape and icon library">
        <div className="library-section"><strong>Shapes</strong><div className="library-grid">{SHAPE_ITEMS.map(({ tool: shape, label, icon: Icon }) => <button key={shape} className={tool === shape ? 'active' : ''} aria-label={`${label} shape`} title={label} onClick={() => { setTool(shape); setSelected([]); setLibraryOpen(false) }}><Icon size={21}/><span>{label}</span></button>)}</div></div>
        <div className="library-section"><strong>Icons</strong><div className="library-grid icon-grid">{ICON_ITEMS.map(({ name: iconName, label, icon: Icon }) => <button key={iconName} className={tool === 'icon' && selectedIcon === iconName ? 'active' : ''} aria-label={`${label} icon`} title={label} onClick={() => { setSelectedIcon(iconName); setTool('icon'); setSelected([]); setLibraryOpen(false) }}><Icon size={21}/><span>{label}</span></button>)}</div></div>
      </div>}

      <section className="canvas-wrap">
        <svg ref={svgRef} className="canvas" aria-label="Infinite whiteboard canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} onDoubleClick={e => {
          const id = ((e.target as Element).closest?.('[data-element-id]') as SVGElement | null)?.dataset.elementId
          const el = elements.find(item => item.id === id); if (el?.type === 'text') { e.stopPropagation(); const p = worldPoint(e.clientX, e.clientY); beginText(p, el, textCaretFromPoint(el, p)) }
        }}>
          <defs><pattern id="minor-grid" width={24 * view.zoom} height={24 * view.zoom} patternUnits="userSpaceOnUse" x={view.x % (24 * view.zoom)} y={view.y % (24 * view.zoom)}><circle cx="1" cy="1" r="1" fill={gridColor}/></pattern><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></marker></defs>
          <rect width="100%" height="100%" fill={background}/><rect width="100%" height="100%" fill="url(#minor-grid)"/>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {elements.map(el => el.id === textEdit?.id ? null : <ElementView key={el.id} el={el} selected={selected.includes(el.id)}/>) }
            {interaction?.type === 'draw' && <path d={smoothPath(interaction.points)} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>}
            {draftShape && <ElementView el={draftShape} selected={false} draft/>}
            {interaction?.type === 'marquee' && (() => { const b = normalizedBox(interaction.start, interaction.current); return <rect x={b.x} y={b.y} width={b.width} height={b.height} className="marquee"/> })()}
            {selectionBounds && !textEdit && <SelectionBox bounds={selectionBounds} zoom={view.zoom} onResize={beginResize} onRotate={beginRotate}/>} 
          </g>
        </svg>

        {textEdit && editorDimensions && <textarea ref={textAreaRef} aria-label="Canvas text editor" wrap="off" className="text-editor" value={textEdit.value} onChange={e => setTextEdit({ ...textEdit, value: e.target.value })} onBlur={finishText} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); setTextEdit(null) } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); finishText() } }} onKeyUp={e => e.stopPropagation()} style={{ left: textEdit.x * view.zoom + view.x, top: textEdit.y * view.zoom + view.y, width: editorDimensions.width * view.zoom, height: editorDimensions.height * view.zoom, fontSize: fontSize * view.zoom, fontFamily, fontWeight: bold ? 700 : 400, fontStyle: italic ? 'italic' : 'normal', textAlign: align, color: stroke }}/>} 
      </section>

      <div className="zoom-controls"><button onClick={() => zoomAt(view.zoom / 1.2)} aria-label="Zoom out"><ZoomOut size={17}/></button><button className="zoom-readout" onClick={() => zoomAt(1)}>{Math.round(view.zoom * 100)}%</button><button onClick={() => zoomAt(view.zoom * 1.2)} aria-label="Zoom in"><ZoomIn size={17}/></button><span/><button onClick={fitCanvas} aria-label="Fit canvas" title="Fit canvas"><Focus size={17}/></button></div>

      <div className="stylebar">
        <div className="style-group canvas-colors"><span className="style-label">Canvas</span>{CANVAS_BACKGROUNDS.map(color => <button key={color} aria-label={`Canvas background ${color}`} className={`color-swatch canvas-swatch ${background === color ? 'active' : ''}`} style={{ background: color }} onClick={() => setBackground(color)}/>)}</div>
        <div className="style-group"><span className="style-label">Stroke</span>{COLORS.map(color => <button key={color} aria-label={`Stroke ${color}`} className={`color-swatch ${stroke === color ? 'active' : ''}`} style={{ background: color }} onClick={() => { setStroke(color); applyStyle({ stroke: color }) }}/>)}</div>
        {tool !== 'pen' && tool !== 'text' && tool !== 'icon' && !selectedElements.some(el => el.type === 'icon') && <div className="style-group"><span className="style-label">Fill</span>{FILLS.map(color => <button key={color} aria-label={`Fill ${color}`} className={`color-swatch fill ${fill === color ? 'active' : ''} ${color === 'transparent' ? 'transparent' : ''}`} style={{ background: color === 'transparent' ? '#fff' : color }} onClick={() => { setFill(color); applyStyle({ fill: color }) }}/>)}</div>}
        <div className="style-group widths"><span className="style-label">Width</span>{[2, 3, 6].map(width => <button key={width} className={strokeWidth === width ? 'active' : ''} onClick={() => { setStrokeWidth(width); applyStyle({ strokeWidth: width }) }} aria-label={`Stroke width ${width}`}><i style={{ height: width }}/></button>)}</div>
        {(tool === 'text' || selectedElements.some(el => el.type === 'text')) && <>
          <div className="style-group text-format"><select aria-label="Font family" value={fontFamily} onChange={e => { setFontFamily(e.target.value); applyStyle({ fontFamily: e.target.value }) }}><option value="Inter, system-ui, sans-serif">Sans</option><option value="Georgia, serif">Serif</option><option value="ui-monospace, SFMono-Regular, monospace">Mono</option></select><select aria-label="Font size" value={fontSize} onChange={e => { const size = Number(e.target.value); setFontSize(size); applyStyle({ fontSize: size }) }}>{[14,18,22,28,36,48,64].map(size => <option key={size}>{size}</option>)}</select><button className={bold ? 'active' : ''} onClick={() => { setBold(!bold); applyStyle({ bold: !bold }) }} aria-label="Bold"><Bold size={16}/></button><button className={italic ? 'active' : ''} onClick={() => { setItalic(!italic); applyStyle({ italic: !italic }) }} aria-label="Italic"><Italic size={16}/></button>
          <select aria-label="Text alignment" value={align} onChange={e => { const a = e.target.value as typeof align; setAlign(a); applyStyle({ align: a }) }}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div>
        </>}
        {selected.length > 0 && <button className="delete-button" onClick={deleteSelection}><Trash2 size={16}/> Delete</button>}
      </div>

      {tool === 'pen' && <div className="hint">Hold <kbd>Shift</kbd> as you release to tidy a rough line, circle, or rectangle</div>}
      {toast && <div className="toast"><Check size={17}/>{toast}</div>}
    </main>
  )
}

function ElementView({ el, selected, draft = false }: { el: BoardElement; selected: boolean; draft?: boolean }) {
  const transform = `translate(${el.x} ${el.y}) rotate(${el.rotation} ${el.width / 2} ${el.height / 2})`
  const common = { stroke: el.stroke, fill: el.fill, strokeWidth: el.strokeWidth, opacity: draft ? .65 : el.opacity, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, vectorEffect: 'non-scaling-stroke' as const }
  const attr = draft ? {} : { 'data-element-id': el.id, ...(el.type === 'icon' ? { 'data-icon-name': el.iconName ?? 'check' } : {}) }
  let content
  if (el.type === 'pen') {
    const points = el.points ?? []
    const naturalWidth = Math.max(1, ...points.map(point => point.x))
    const naturalHeight = Math.max(1, ...points.map(point => point.y))
    content = <path d={smoothPath(points)} transform={`scale(${el.width / naturalWidth} ${el.height / naturalHeight})`} {...common}/>
  }
  else if (el.type === 'rectangle') content = <rect width={el.width} height={el.height} rx={8} {...common}/>
  else if (el.type === 'ellipse') content = <ellipse cx={el.width / 2} cy={el.height / 2} rx={el.width / 2} ry={el.height / 2} {...common}/>
  else if (el.type === 'diamond') content = <path d={`M ${el.width / 2} 0 L ${el.width} ${el.height / 2} L ${el.width / 2} ${el.height} L 0 ${el.height / 2} Z`} {...common}/>
  else if (['triangle', 'pentagon', 'hexagon', 'star', 'cloud', 'cylinder', 'speech'].includes(el.type)) content = <path d={extendedShapePath(el.type as ExtendedShape, el.width, el.height)} {...common}/>
  else if (el.type === 'icon') content = <><rect width={el.width} height={el.height} fill="transparent" stroke="none" pointerEvents="all"/><svg width={el.width} height={el.height} viewBox="0 0 24 24" overflow="visible"><g fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth} opacity={el.opacity} strokeLinecap="round" strokeLinejoin="round">{(ICON_PATHS[el.iconName ?? 'check'] ?? ICON_PATHS.check).map((path, index) => <path key={index} d={path} vectorEffect="non-scaling-stroke"/>)}</g></svg></>
  else if (el.type === 'line' || el.type === 'arrow') {
    const x1 = el.flipX ? el.width : 0, y1 = el.flipY ? el.height : 0, x2 = el.flipX ? 0 : el.width, y2 = el.flipY ? 0 : el.height
    content = <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} markerEnd={el.type === 'arrow' ? 'url(#arrowhead)' : undefined}/>
  } else {
    const x = el.align === 'center' ? el.width / 2 : el.align === 'right' ? el.width : 0
    content = <><rect className="text-hit-area" width={el.width} height={el.height} fill="transparent" stroke="none" pointerEvents="all"/><text x={x} y={el.fontSize ?? 22} fill={el.stroke} stroke="none" opacity={el.opacity} textAnchor={el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start'} fontFamily={el.fontFamily} fontSize={el.fontSize} fontWeight={el.bold ? 700 : 400} fontStyle={el.italic ? 'italic' : 'normal'}>{(el.text ?? '').split('\n').map((line, i) => <tspan x={x} dy={i ? '1.25em' : undefined} key={i}>{line || ' '}</tspan>)}</text></>
  }
  return <g transform={transform} {...attr} className={selected ? 'element selected-element' : 'element'}>{content}</g>
}

function SelectionBox({ bounds: b, zoom, onResize, onRotate }: { bounds: { x: number; y: number; width: number; height: number }; zoom: number; onResize: (e: React.PointerEvent, corner: string) => void; onRotate: (e: React.PointerEvent) => void }) {
  const size = 9 / zoom, half = size / 2, offset = 25 / zoom
  const corners = [{ key: 'nw', x: b.x, y: b.y }, { key: 'ne', x: b.x + b.width, y: b.y }, { key: 'sw', x: b.x, y: b.y + b.height }, { key: 'se', x: b.x + b.width, y: b.y + b.height }]
  return <g className="selection-ui"><rect x={b.x} y={b.y} width={b.width} height={b.height}/><line x1={b.x + b.width / 2} y1={b.y} x2={b.x + b.width / 2} y2={b.y - offset}/><circle className="rotate-handle" cx={b.x + b.width / 2} cy={b.y - offset} r={half + 1 / zoom} onPointerDown={onRotate}/>{corners.map(c => <rect key={c.key} className={`resize-handle ${c.key}`} x={c.x - half} y={c.y - half} width={size} height={size} rx={2 / zoom} onPointerDown={e => onResize(e, c.key)}/>)}</g>
}

export default App
