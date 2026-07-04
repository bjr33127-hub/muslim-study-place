import type { TaskWindow, WidgetLayout } from '../types/app'

export const DEFAULT_TASK_WINDOW_ID = 'todo'
export const DEFAULT_TASK_WINDOW_TITLE = 'Taches'

export const DEFAULT_TASK_WINDOWS: TaskWindow[] = [
  {
    id: DEFAULT_TASK_WINDOW_ID,
    title: DEFAULT_TASK_WINDOW_TITLE,
    rank: 1,
    createdAt: 1,
    updatedAt: 1,
    deletable: false,
  },
]

function cleanTitle(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function cleanNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeTaskWindow(
  value: Partial<TaskWindow>,
  index: number,
): TaskWindow {
  const id =
    typeof value.id === 'string' && value.id
      ? value.id
      : `task-window-${Date.now()}-${index}`
  const createdAt = cleanNumber(value.createdAt, Date.now() + index)
  const fallbackTitle =
    id === DEFAULT_TASK_WINDOW_ID
      ? DEFAULT_TASK_WINDOW_TITLE
      : `Taches ${index + 1}`

  return {
    id,
    title: cleanTitle(value.title, fallbackTitle),
    rank: cleanNumber(value.rank, index + 1),
    createdAt,
    updatedAt: cleanNumber(value.updatedAt, createdAt),
    deletable: id === DEFAULT_TASK_WINDOW_ID ? false : Boolean(value.deletable),
  }
}

export function normalizeTaskWindows(value: unknown): TaskWindow[] {
  const source = Array.isArray(value) ? value : []
  const byId = new Map<string, TaskWindow>()

  DEFAULT_TASK_WINDOWS.forEach((window) => {
    byId.set(window.id, window)
  })

  source.forEach((item, index) => {
    const window = normalizeTaskWindow(item as Partial<TaskWindow>, index)
    byId.set(window.id, window)
  })

  const windows = Array.from(byId.values()).map((window, index) =>
    window.id === DEFAULT_TASK_WINDOW_ID
      ? { ...window, deletable: false, rank: Math.min(window.rank, 1) }
      : { ...window, rank: Number.isFinite(window.rank) ? window.rank : index + 1 },
  )

  return windows.sort((first, second) => first.rank - second.rank || first.createdAt - second.createdAt)
}

function cleanLayout(
  id: string,
  index: number,
  fallback: WidgetLayout,
): WidgetLayout {
  const offset = Math.min(index * 24, 96)

  return {
    ...fallback,
    id,
    x: fallback.x + offset,
    y: fallback.y + offset,
    z: fallback.z + index,
    visible: true,
  }
}

function normalizeStoredLayout(
  id: string,
  fallback: WidgetLayout,
  value: Partial<WidgetLayout> | undefined,
): WidgetLayout {
  if (!value) {
    return { ...fallback, id }
  }

  return {
    id,
    x: cleanNumber(value.x, fallback.x),
    y: cleanNumber(value.y, fallback.y),
    width: cleanNumber(value.width, fallback.width),
    height: cleanNumber(value.height, fallback.height),
    visible: typeof value.visible === 'boolean' ? value.visible : fallback.visible,
    z: cleanNumber(value.z, fallback.z),
  }
}

export function normalizeTaskWindowLayouts(
  value: unknown,
  windows: TaskWindow[],
  fallbackLayout: WidgetLayout,
): Record<string, WidgetLayout> {
  const stored =
    value && typeof value === 'object'
      ? (value as Record<string, Partial<WidgetLayout>>)
      : {}

  return windows.reduce<Record<string, WidgetLayout>>((layouts, window, index) => {
    const fallback = cleanLayout(window.id, index, fallbackLayout)
    layouts[window.id] = normalizeStoredLayout(window.id, fallback, stored[window.id])
    return layouts
  }, {})
}
