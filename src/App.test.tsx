import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { saveDocument } from './db'
import { exportSvg } from './export'
import './styles.css'

const chooseLibraryItem = async (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Shapes and icons' }))
  fireEvent.click(await screen.findByRole('button', { name }))
}

const fireTouchPointer = (target: Element, type: string, pointerId: number, clientX: number, clientY: number) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: type === 'pointerup' ? 0 : 1 })
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
  })
  fireEvent(target, event)
}

vi.mock('./db', () => {
  const doc = {
    id: 'test-board', name: 'Test board', elements: [], view: { x: 0, y: 0, zoom: 1 },
    createdAt: 1, updatedAt: 1, version: 1 as const,
  }
  return {
    listDocuments: vi.fn(async () => [{ id: doc.id, name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt }]),
    getDocument: vi.fn(async () => ({ ...doc, elements: [] })),
    saveDocument: vi.fn(async () => undefined),
    deleteDocument: vi.fn(async () => undefined),
  }
})

vi.mock('./export', () => ({
  exportPng: vi.fn(async () => undefined),
  exportProject: vi.fn(),
  exportSvg: vi.fn(),
}))

describe('Stillboard core interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent })
    Object.defineProperty(SVGElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('focuses the text editor and isolates typing from canvas shortcuts', async () => {
    render(<App />)
    const textTool = await screen.findByRole('button', { name: 'Text tool' })
    const arrowTool = screen.getByRole('button', { name: 'Arrow tool' })
    const canvas = screen.getByLabelText('Infinite whiteboard canvas')

    fireEvent.click(textTool)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 420, clientY: 260 })

    const editor = await screen.findByLabelText('Canvas text editor')
    await waitFor(() => expect(document.activeElement).toBe(editor))

    fireEvent.change(editor, { target: { value: 'a rapid plan' } })
    for (const key of ['a', 'r', 'p', 'd', 'v', 'h']) fireEvent.keyDown(editor, { key, code: `Key${key.toUpperCase()}` })
    // Also cover the short interval guarded by textEdit state even if a key is
    // observed at window level rather than from the textarea.
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' })

    expect(textTool.className).toContain('active')
    expect(arrowTool.className).not.toContain('active')
    expect(editor).toHaveProperty('value', 'a rapid plan')

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 10, clientX: 620, clientY: 360 })
    await screen.findByText('a rapid plan')
    expect(textTool.className).toContain('active')
    const nextEditor = await screen.findByLabelText('Canvas text editor')
    expect(nextEditor).toHaveProperty('value', '')
    await waitFor(() => expect(document.activeElement).toBe(nextEditor))
    fireEvent.keyDown(nextEditor, { key: 'Escape', code: 'Escape' })
  })

  it('creates a shape and restores the board with undo', async () => {
    render(<App />)
    await screen.findByRole('button', { name: 'Shapes and icons' })
    const canvas = screen.getByLabelText('Infinite whiteboard canvas')

    await chooseLibraryItem('Rectangle shape')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 2, clientX: 100, clientY: 120 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 2, clientX: 240, clientY: 210 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 2, clientX: 240, clientY: 210 })

    await waitFor(() => expect(canvas.querySelectorAll('[data-element-id]').length).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(canvas.querySelectorAll('[data-element-id]').length).toBe(0))
  })

  it('draws freehand and tidies a shifted pen stroke into a line', async () => {
    render(<App />)
    const penTool = await screen.findByRole('button', { name: 'Pen tool' })
    const canvas = screen.getByLabelText('Infinite whiteboard canvas')

    fireEvent.click(penTool)
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 3, clientX: 80, clientY: 90 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 3, clientX: 120, clientY: 115 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 3, clientX: 170, clientY: 125 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 3, clientX: 170, clientY: 125 })

    await waitFor(() => expect(canvas.querySelector('[data-element-id] path')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 4, clientX: 50, clientY: 60 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 4, clientX: 100, clientY: 61 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 4, clientX: 180, clientY: 62 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 4, clientX: 180, clientY: 62, shiftKey: true })

    await waitFor(() => expect(canvas.querySelector('[data-element-id] line')).not.toBeNull())
  })

  it('moves, resizes, rotates, deletes, undoes, and redoes a selection', async () => {
    render(<App />)
    const canvas = await screen.findByLabelText('Infinite whiteboard canvas')
    await chooseLibraryItem('Rectangle shape')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 5, clientX: 100, clientY: 120 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 5, clientX: 240, clientY: 210 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 5, clientX: 240, clientY: 210 })

    let element = canvas.querySelector('[data-element-id]') as SVGGElement
    fireEvent.pointerDown(element, { button: 0, pointerId: 6, clientX: 150, clientY: 150 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 6, clientX: 200, clientY: 180 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 6, clientX: 200, clientY: 180 })
    element = canvas.querySelector('[data-element-id]') as SVGGElement
    expect(element.getAttribute('transform')).toContain('translate(150 150)')

    const resizeHandle = canvas.querySelector('.resize-handle.se') as SVGElement
    fireEvent.pointerDown(resizeHandle, { button: 0, pointerId: 7, clientX: 290, clientY: 240 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 7, clientX: 340, clientY: 280 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 7, clientX: 340, clientY: 280 })
    element = canvas.querySelector('[data-element-id]') as SVGGElement
    expect(Number(element.querySelector('rect')?.getAttribute('width'))).toBeGreaterThan(140)

    const rotateHandle = canvas.querySelector('.rotate-handle') as SVGElement
    fireEvent.pointerDown(rotateHandle, { button: 0, pointerId: 8, clientX: 245, clientY: 190 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 8, clientX: 300, clientY: 215 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 8, clientX: 300, clientY: 215 })
    element = canvas.querySelector('[data-element-id]') as SVGGElement
    expect(element.getAttribute('transform')).not.toContain('rotate(0 ')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(canvas.querySelectorAll('[data-element-id]').length).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(canvas.querySelectorAll('[data-element-id]').length).toBe(1))
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(canvas.querySelectorAll('[data-element-id]').length).toBe(0))
  })

  it('pans, zooms, opens local boards, and invokes vector export', async () => {
    render(<App />)
    const canvas = await screen.findByLabelText('Infinite whiteboard canvas')

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('button', { name: '120%' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hand tool' }))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 9, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 9, clientX: 150, clientY: 140 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 9, clientX: 150, clientY: 140 })
    expect(canvas.querySelector('g')?.getAttribute('transform')).toContain('translate(50 40) scale(1.2)')

    fireEvent.click(screen.getByRole('button', { name: 'Open board switcher' }))
    expect(await screen.findByText('Your boards')).toBeTruthy()
    expect(screen.getAllByText('Test board').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'File menu' }))
    fireEvent.click(await screen.findByText('Export SVG'))
    expect(exportSvg).toHaveBeenCalledOnce()
  })

  it('uses two fingers to pan and pinch without creating a canvas element', async () => {
    render(<App />)
    const canvas = await screen.findByLabelText('Infinite whiteboard canvas')

    fireTouchPointer(canvas, 'pointerdown', 31, 100, 100)
    fireTouchPointer(canvas, 'pointerdown', 32, 200, 100)
    fireTouchPointer(canvas, 'pointermove', 32, 250, 100)

    expect(screen.getByRole('button', { name: '150%' })).toBeTruthy()
    expect(canvas.querySelector('g')?.getAttribute('transform')).toContain('scale(1.5)')
    expect(canvas.querySelectorAll('[data-element-id]')).toHaveLength(0)

    fireTouchPointer(canvas, 'pointerup', 31, 100, 100)
    fireTouchPointer(canvas, 'pointerup', 32, 250, 100)
  })

  it('keeps extra vector shapes and icon stamps in one compact library', async () => {
    render(<App />)
    const canvas = await screen.findByLabelText('Infinite whiteboard canvas')

    await chooseLibraryItem('Star shape')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 18, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 18, clientX: 200, clientY: 200 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 18, clientX: 200, clientY: 200 })
    expect(canvas.querySelector('[data-element-id] path')).not.toBeNull()

    await chooseLibraryItem('Heart icon')
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 19, clientX: 260, clientY: 100 })
    fireEvent.pointerMove(canvas, { buttons: 1, pointerId: 19, clientX: 340, clientY: 180 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 19, clientX: 340, clientY: 180 })
    expect(canvas.querySelector('[data-icon-name="heart"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Shapes and icons' }))
    expect(await screen.findByRole('dialog', { name: 'Shape and icon library' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cloud shape' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Database icon' })).toBeTruthy()
  })

  it('changes the canvas background without showing a text-entry box', async () => {
    render(<App />)
    const canvas = await screen.findByLabelText('Infinite whiteboard canvas')
    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Canvas background #e5eff9' }))
    fireEvent.click(screen.getByRole('button', { name: 'Canvas pattern Grid' }))
    expect(canvas.querySelector('rect')?.getAttribute('fill')).toBe('#e5eff9')
    expect(canvas.querySelector('#canvas-paper')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Text tool' }))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 11, clientX: 300, clientY: 250 })
    const editor = await screen.findByLabelText('Canvas text editor')
    expect(editor.getAttribute('placeholder')).toBeNull()
    expect(editor.className).toBe('text-editor')
    const editorStyle = getComputedStyle(editor)
    expect(editorStyle.borderTopStyle).toBe('none')
    expect(editorStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(editorStyle.resize).toBe('none')
    await waitFor(() => expect(vi.mocked(saveDocument).mock.calls.some(([doc]) => doc.background === '#e5eff9' && doc.canvasPattern === 'grid')).toBe(true), { timeout: 1500 })
  })

  it('keeps appearance options compact and removes the light header haze on dark plain canvas', async () => {
    const { container } = render(<App />)
    const canvas = await screen.findByLabelText('Infinite whiteboard canvas')
    expect(screen.queryByRole('button', { name: 'Canvas background #161918' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Canvas settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Canvas background #161918' }))
    fireEvent.click(screen.getByRole('button', { name: 'Canvas pattern Plain' }))
    expect(container.querySelector('main')?.className).toContain('dark-canvas')
    expect(getComputedStyle(container.querySelector('.topbar')!).backgroundImage).toBe('none')
    expect(canvas.querySelector('#canvas-paper')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Text tool' }))
    expect(screen.getByRole('combobox', { name: 'Font size' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Canvas background #ffffff' })).toBeNull()
  })

  it('reopens existing text, continues it in place, and deletes it when emptied', async () => {
    render(<App />)
    const canvas = await screen.findByLabelText('Infinite whiteboard canvas')
    const textTool = screen.getByRole('button', { name: 'Text tool' })
    fireEvent.click(textTool)

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 12, clientX: 120, clientY: 120 })
    let editor = await screen.findByLabelText('Canvas text editor') as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'what is up' } })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 13, clientX: 500, clientY: 300 })
    const originalText = await screen.findByText('what is up')
    fireEvent.keyDown(screen.getByLabelText('Canvas text editor'), { key: 'Escape', code: 'Escape' })

    fireEvent.pointerDown(originalText, { button: 0, pointerId: 14, clientX: 255, clientY: 130 })
    editor = await screen.findByLabelText('Canvas text editor') as HTMLTextAreaElement
    expect(editor).toHaveProperty('value', 'what is up')
    expect(editor.selectionStart).toBe('what is up'.length)
    expect(Array.from(canvas.querySelectorAll('tspan')).some(node => node.textContent === 'what is up')).toBe(false)

    fireEvent.change(editor, { target: { value: 'what is up new world' } })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 15, clientX: 600, clientY: 360 })
    const continuedText = await screen.findByText('what is up new world')
    expect(screen.queryByText('new world')).toBeNull()
    fireEvent.keyDown(screen.getByLabelText('Canvas text editor'), { key: 'Escape', code: 'Escape' })

    fireEvent.pointerDown(continuedText, { button: 0, pointerId: 16, clientX: 370, clientY: 130 })
    editor = await screen.findByLabelText('Canvas text editor') as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: '' } })
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 17, clientX: 650, clientY: 400 })
    expect(screen.queryByText('what is up new world')).toBeNull()
    fireEvent.keyDown(screen.getByLabelText('Canvas text editor'), { key: 'Escape', code: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByText('what is up new world')
  })
})
