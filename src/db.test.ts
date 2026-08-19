import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { deleteDocument, getDocument, listDocuments, saveDocument } from './db'
import type { BoardDocument } from './types'

describe('local IndexedDB documents', () => {
  it('saves, lists, restores, and deletes an editable board locally', async () => {
    const doc: BoardDocument = {
      id: 'local-db-test', name: 'Local test', version: 1, createdAt: 10, updatedAt: 20,
      view: { x: 12, y: 34, zoom: 1.5 }, background: '#eaf1f8',
      elements: [{ id: 'shape', type: 'rectangle', x: 1, y: 2, width: 30, height: 40, rotation: 0, stroke: '#111', fill: 'transparent', strokeWidth: 3, opacity: 1 }],
    }

    await saveDocument(doc)
    expect(await getDocument(doc.id)).toEqual(doc)
    expect(await listDocuments()).toContainEqual({ id: doc.id, name: doc.name, createdAt: doc.createdAt, updatedAt: doc.updatedAt })
    await deleteDocument(doc.id)
    expect(await getDocument(doc.id)).toBeUndefined()
  })
})
