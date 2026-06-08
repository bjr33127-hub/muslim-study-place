import {
  Pin,
  PinOff,
  Plus,
  Search,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { usePersistentState } from '../../hooks/usePersistentState'
import { createNote, normalizeNotes, sortNotes } from '../../lib/notes'
import type { NoteItem } from '../../types/app'

function notePreview(note: NoteItem) {
  const preview = note.body.replace(/\s+/g, ' ').trim()
  return preview || 'Empty note'
}

export function NotesWidget() {
  const [notesState, setNotes] = usePersistentState<NoteItem[]>('notes', [])
  const [selectedNoteId, setSelectedNoteId] = usePersistentState(
    'notes:selected',
    '',
  )
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = usePersistentState(
    'notes:category',
    'All',
  )

  const notes = useMemo(() => normalizeNotes(notesState), [notesState])
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(notes.map((note) => note.category)))],
    [notes],
  )
  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return sortNotes(notes).filter((note) => {
      const matchesCategory =
        categoryFilter === 'All' || note.category === categoryFilter
      const matchesQuery =
        !normalizedQuery ||
        `${note.title} ${note.category} ${note.body}`
          .toLowerCase()
          .includes(normalizedQuery)

      return matchesCategory && matchesQuery
    })
  }, [categoryFilter, notes, query])
  const selectedNote =
    notes.find((note) => note.id === selectedNoteId) ?? visibleNotes[0]

  useEffect(() => {
    if (!selectedNote && selectedNoteId) {
      setSelectedNoteId('')
      return
    }

    if (selectedNote && selectedNote.id !== selectedNoteId) {
      setSelectedNoteId(selectedNote.id)
    }
  }, [selectedNote, selectedNoteId, setSelectedNoteId])

  useEffect(() => {
    if (!categories.includes(categoryFilter)) {
      setCategoryFilter('All')
    }
  }, [categories, categoryFilter, setCategoryFilter])

  const addNote = () => {
    const note = createNote()
    setNotes((current) => [note, ...normalizeNotes(current)])
    setSelectedNoteId(note.id)
    setCategoryFilter('All')
  }

  const updateNote = (id: string, patch: Partial<NoteItem>) => {
    setNotes((current) =>
      normalizeNotes(current).map((note) =>
        note.id === id
          ? {
              ...note,
              ...patch,
              updatedAt: Date.now(),
            }
          : note,
      ),
    )
  }

  const deleteNote = (id: string) => {
    const remaining = sortNotes(notes.filter((note) => note.id !== id))
    setNotes(remaining)
    setSelectedNoteId(remaining[0]?.id ?? '')
  }

  return (
    <div className="notes-widget">
      <div className="notes-toolbar">
        <label className="notes-search">
          <Search size={14} strokeWidth={1.8} />
          <input
            aria-label="Search notes"
            value={query}
            placeholder="Search notes"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          className="icon-button note-add-button"
          type="button"
          aria-label="New note"
          onClick={addNote}
        >
          <Plus size={16} strokeWidth={1.9} />
        </button>
      </div>

      <div className="notes-categories" aria-label="Note categories">
        {categories.map((category) => (
          <button
            key={category}
            className={category === categoryFilter ? 'is-selected' : ''}
            type="button"
            onClick={() => setCategoryFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="notes-list" aria-label="Notes list">
        {visibleNotes.map((note) => (
          <button
            key={note.id}
            className={`note-row${
              selectedNote?.id === note.id ? ' is-selected' : ''
            }`}
            type="button"
            onClick={() => setSelectedNoteId(note.id)}
          >
            <span className="note-row-icon" aria-hidden="true">
              {note.pinned ? (
                <Pin size={13} strokeWidth={1.8} />
              ) : (
                <StickyNote size={13} strokeWidth={1.8} />
              )}
            </span>
            <span>
              <strong>{note.title}</strong>
              <small>{note.category}</small>
            </span>
            <em>{notePreview(note)}</em>
          </button>
        ))}
        {!visibleNotes.length ? (
          <div className="notes-empty">
            <StickyNote size={18} strokeWidth={1.8} />
            <span>No notes yet</span>
          </div>
        ) : null}
      </div>

      {selectedNote ? (
        <div className="note-editor">
          <input
            aria-label="Note title"
            className="note-title-input"
            value={selectedNote.title}
            onChange={(event) =>
              updateNote(selectedNote.id, {
                title: event.target.value || 'Untitled note',
              })
            }
          />
          <div className="note-meta-row">
            <input
              aria-label="Note category"
              value={selectedNote.category}
              onChange={(event) =>
                updateNote(selectedNote.id, {
                  category: event.target.value || 'General',
                })
              }
            />
            <button
              className="quiet-icon"
              type="button"
              aria-label={
                selectedNote.pinned
                  ? `Unpin ${selectedNote.title}`
                  : `Pin ${selectedNote.title}`
              }
              onClick={() =>
                updateNote(selectedNote.id, { pinned: !selectedNote.pinned })
              }
            >
              {selectedNote.pinned ? (
                <PinOff size={15} strokeWidth={1.8} />
              ) : (
                <Pin size={15} strokeWidth={1.8} />
              )}
            </button>
            <button
              className="quiet-icon"
              type="button"
              aria-label={`Delete ${selectedNote.title}`}
              onClick={() => deleteNote(selectedNote.id)}
            >
              <Trash2 size={15} strokeWidth={1.8} />
            </button>
          </div>
          <textarea
            aria-label="Note body"
            value={selectedNote.body}
            placeholder="Write notes..."
            onChange={(event) =>
              updateNote(selectedNote.id, { body: event.target.value })
            }
          />
        </div>
      ) : null}
    </div>
  )
}
