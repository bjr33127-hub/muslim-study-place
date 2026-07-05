import type { TodoDifficulty, TodoItem, TodoPriority } from '../types/app'
import { DEFAULT_TASK_WINDOW_ID } from './taskWindows'

export type TodoFilter = 'active' | 'completed' | 'all'
export type TodoSortMode =
  | 'manual'
  | 'created-desc'
  | 'created-asc'
  | 'name-asc'
  | 'name-desc'
  | 'priority'
  | 'difficulty'
  | 'status'
  | 'progress-desc'
  | 'progress-asc'
  | 'target-desc'
  | 'target-asc'

export type CompletedTodoGroup = {
  rootId: string
  template: TodoItem
  items: TodoItem[]
  count: number
  latestCompletedAt: number | null
  totalCompletedPomodoros: number
  totalRequiredPomodoros: number
}

export const TODO_PRIORITIES: TodoPriority[] = [
  'urgent',
  'high',
  'medium',
  'low',
  'later',
]
export const TODO_DIFFICULTIES: TodoDifficulty[] = [
  'easy',
  'normal',
  'hard',
  'intense',
]

const PRIORITY_RANK: Record<TodoPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  later: 4,
}

const DIFFICULTY_RANK: Record<TodoDifficulty, number> = {
  intense: 0,
  hard: 1,
  normal: 2,
  easy: 3,
}

export const seedTodos: TodoItem[] = [
  {
    id: 'seed-quran',
    text: 'Quran revision',
    priority: 'high',
    difficulty: 'hard',
    rank: 1,
    completed: false,
    active: true,
    requiredPomodoros: 3,
    completedPomodoros: 0,
    createdAt: 1,
    updatedAt: 1,
    completedAt: null,
    repeatIndex: 0,
  },
  {
    id: 'seed-study',
    text: 'Study session review',
    priority: 'medium',
    difficulty: 'normal',
    rank: 2,
    completed: false,
    active: false,
    requiredPomodoros: 2,
    completedPomodoros: 0,
    createdAt: 2,
    updatedAt: 2,
    completedAt: null,
    repeatIndex: 0,
  },
]

export function clampPomodoros(value: number) {
  return Math.min(Math.max(value || 1, 1), 12)
}

export function normalizePriority(value: unknown): TodoPriority {
  return TODO_PRIORITIES.includes(value as TodoPriority)
    ? (value as TodoPriority)
    : 'medium'
}

export function normalizeDifficulty(value: unknown): TodoDifficulty {
  return TODO_DIFFICULTIES.includes(value as TodoDifficulty)
    ? (value as TodoDifficulty)
    : 'normal'
}

function cleanText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Untitled task'
}

function cleanNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalizeTodo(todo: Partial<TodoItem>, index = 0): TodoItem {
  const requiredPomodoros = clampPomodoros(todo.requiredPomodoros ?? 1)
  const completedPomodoros = Math.min(
    Math.max(todo.completedPomodoros || 0, 0),
    requiredPomodoros,
  )
  const createdAt = cleanNumber(todo.createdAt, Date.now())
  const updatedAt = cleanNumber(todo.updatedAt, createdAt)
  const completed = Boolean(todo.completed) || completedPomodoros >= requiredPomodoros

  return {
    id:
      typeof todo.id === 'string' && todo.id
        ? todo.id
        : `todo-${Date.now()}-${index}`,
    windowId:
      typeof todo.windowId === 'string' && todo.windowId
        ? todo.windowId
        : DEFAULT_TASK_WINDOW_ID,
    revisionEventId:
      typeof todo.revisionEventId === 'string' && todo.revisionEventId
        ? todo.revisionEventId
        : undefined,
    text: cleanText(todo.text),
    priority: normalizePriority(todo.priority),
    difficulty: normalizeDifficulty(todo.difficulty),
    rank: cleanNumber(todo.rank, createdAt || index + 1),
    active: Boolean(todo.active),
    requiredPomodoros,
    completedPomodoros,
    completed,
    createdAt,
    updatedAt,
    completedAt: completed
      ? cleanNumber(todo.completedAt, updatedAt)
      : null,
    repeatOf:
      typeof todo.repeatOf === 'string' && todo.repeatOf ? todo.repeatOf : undefined,
    repeatIndex: Math.max(0, Math.round(cleanNumber(todo.repeatIndex, 0))),
  }
}

export function normalizeTodos(todos: Partial<TodoItem>[] | unknown) {
  if (!Array.isArray(todos)) {
    return []
  }

  let activeFound = false

  return todos.map((todo, index) => {
    const normalized = normalizeTodo(todo, index)
    const active = normalized.active && !normalized.completed && !activeFound

    if (active) {
      activeFound = true
    }

    return { ...normalized, active }
  })
}

export function todoRootId(todo: TodoItem) {
  return todo.repeatOf ?? todo.id
}

export function hasOpenTodoForRoot(todos: TodoItem[], rootId: string) {
  return todos.some((todo) => !todo.completed && todoRootId(todo) === rootId)
}

function matchesQuery(todo: TodoItem, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  if (!normalizedQuery) {
    return true
  }

  return todo.text.toLocaleLowerCase().includes(normalizedQuery)
}

function byRank(first: TodoItem, second: TodoItem) {
  if (first.rank !== second.rank) {
    return first.rank - second.rank
  }

  return second.createdAt - first.createdAt
}

function progressValue(todo: TodoItem) {
  return todo.completedPomodoros / Math.max(todo.requiredPomodoros, 1)
}

function statusRank(todo: TodoItem) {
  if (todo.completed) {
    return 2
  }

  return todo.completedPomodoros > 0 ? 0 : 1
}

export function compareTodos(
  first: TodoItem,
  second: TodoItem,
  sortMode: TodoSortMode,
) {
  switch (sortMode) {
    case 'created-desc':
      return second.createdAt - first.createdAt || byRank(first, second)
    case 'created-asc':
      return first.createdAt - second.createdAt || byRank(first, second)
    case 'name-asc':
      return (
        first.text.localeCompare(second.text, undefined, { sensitivity: 'base' }) ||
        byRank(first, second)
      )
    case 'name-desc':
      return (
        second.text.localeCompare(first.text, undefined, { sensitivity: 'base' }) ||
        byRank(first, second)
      )
    case 'priority': {
      const priorityDelta =
        PRIORITY_RANK[first.priority] - PRIORITY_RANK[second.priority]

      return priorityDelta || byRank(first, second)
    }
    case 'difficulty': {
      const difficultyDelta =
        DIFFICULTY_RANK[first.difficulty] - DIFFICULTY_RANK[second.difficulty]

      return difficultyDelta || byRank(first, second)
    }
    case 'status': {
      const statusDelta = statusRank(first) - statusRank(second)

      return statusDelta || byRank(first, second)
    }
    case 'progress-desc':
      return progressValue(second) - progressValue(first) || byRank(first, second)
    case 'progress-asc':
      return progressValue(first) - progressValue(second) || byRank(first, second)
    case 'target-desc':
      return second.requiredPomodoros - first.requiredPomodoros || byRank(first, second)
    case 'target-asc':
      return first.requiredPomodoros - second.requiredPomodoros || byRank(first, second)
    case 'manual':
    default:
      return byRank(first, second)
  }
}

export function filterAndSortTodos(
  todos: TodoItem[],
  filter: TodoFilter,
  query = '',
  sortMode: TodoSortMode = 'manual',
) {
  return todos
    .filter((todo) => {
      if (!matchesQuery(todo, query)) {
        return false
      }

      if (filter === 'active') {
        return !todo.completed
      }

      if (filter === 'completed') {
        return todo.completed
      }

      return true
    })
    .sort((first, second) => {
      if (filter === 'all' && first.completed !== second.completed) {
        return first.completed ? 1 : -1
      }

      return compareTodos(first, second, sortMode)
    })
}

export function groupCompletedTodos(
  todos: TodoItem[],
  query = '',
  sortMode: TodoSortMode = 'manual',
): CompletedTodoGroup[] {
  const byRoot = new Map<string, TodoItem[]>()
  const todoById = new Map(todos.map((todo) => [todo.id, todo]))

  todos.forEach((todo) => {
    if (!todo.completed || !matchesQuery(todo, query)) {
      return
    }

    const rootId = todoRootId(todo)
    const items = byRoot.get(rootId) ?? []
    items.push(todo)
    byRoot.set(rootId, items)
  })

  return Array.from(byRoot.entries())
    .map(([rootId, items]) => {
      const orderedItems = [...items].sort((first, second) => {
        const firstCompletedAt = first.completedAt ?? first.updatedAt
        const secondCompletedAt = second.completedAt ?? second.updatedAt

        return secondCompletedAt - firstCompletedAt || compareTodos(first, second, 'manual')
      })
      const root = todoById.get(rootId)
      const template = root && matchesQuery(root, query) ? root : orderedItems[0]
      const latestCompletedAt = orderedItems.reduce<number | null>(
        (latest, todo) => {
          const completedAt = todo.completedAt ?? todo.updatedAt
          return latest === null ? completedAt : Math.max(latest, completedAt)
        },
        null,
      )

      return {
        rootId,
        template,
        items: orderedItems,
        count: orderedItems.length,
        latestCompletedAt,
        totalCompletedPomodoros: orderedItems.reduce(
          (sum, todo) => sum + todo.completedPomodoros,
          0,
        ),
        totalRequiredPomodoros: orderedItems.reduce(
          (sum, todo) => sum + todo.requiredPomodoros,
          0,
        ),
      }
    })
    .sort((first, second) => {
      if (sortMode === 'manual') {
        return compareTodos(first.template, second.template, 'manual')
      }

      return compareTodos(first.template, second.template, sortMode)
    })
}

export function todoCounts(todos: TodoItem[]) {
  return todos.reduce(
    (counts, todo) => {
      if (todo.completed) {
        counts.completed += 1
      } else {
        counts.active += 1
      }

      return counts
    },
    { active: 0, completed: 0 },
  )
}
