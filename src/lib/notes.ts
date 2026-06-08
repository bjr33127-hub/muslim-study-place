import type { NoteItem } from '../types/app'

const DEFAULT_CATEGORY = 'General'

function cleanText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function createNote(): NoteItem {
  const now = Date.now()

  return {
    id: `note-${now}-${Math.random().toString(16).slice(2)}`,
    title: 'Untitled note',
    body: '',
    category: DEFAULT_CATEGORY,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeNotes(notes: unknown): NoteItem[] {
  if (!Array.isArray(notes)) {
    return []
  }

  return notes.flatMap((note) => {
    const candidate = note as Partial<NoteItem>

    if (!candidate.id) {
      return []
    }

    const createdAt =
      typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now()
    const updatedAt =
      typeof candidate.updatedAt === 'number' ? candidate.updatedAt : createdAt

    return [
      {
        id: candidate.id,
        title: cleanText(candidate.title, 'Untitled note'),
        body: typeof candidate.body === 'string' ? candidate.body : '',
        category: cleanText(candidate.category, DEFAULT_CATEGORY),
        pinned: Boolean(candidate.pinned),
        createdAt,
        updatedAt,
      },
    ]
  })
}

export function sortNotes(notes: NoteItem[]) {
  return [...notes].sort((first, second) => {
    if (first.pinned !== second.pinned) {
      return first.pinned ? -1 : 1
    }

    return second.updatedAt - first.updatedAt
  })
}
