import type { TodoItem } from '../types/app'

export const seedTodos: TodoItem[] = [
  {
    id: 'seed-quran',
    text: 'Quran revision',
    completed: false,
    active: true,
    requiredPomodoros: 3,
    completedPomodoros: 0,
    createdAt: 1,
  },
  {
    id: 'seed-study',
    text: 'Study session notes',
    completed: false,
    active: false,
    requiredPomodoros: 2,
    completedPomodoros: 0,
    createdAt: 2,
  },
]

export function clampPomodoros(value: number) {
  return Math.min(Math.max(value || 1, 1), 12)
}

export function normalizeTodo(todo: TodoItem): TodoItem {
  const requiredPomodoros = clampPomodoros(todo.requiredPomodoros)
  const completedPomodoros = Math.min(
    Math.max(todo.completedPomodoros || 0, 0),
    requiredPomodoros,
  )

  return {
    ...todo,
    active: Boolean(todo.active),
    requiredPomodoros,
    completedPomodoros,
    completed: todo.completed || completedPomodoros >= requiredPomodoros,
  }
}

export function normalizeTodos(todos: TodoItem[]) {
  let activeFound = false

  return todos.map((todo) => {
    const normalized = normalizeTodo(todo)
    const active = normalized.active && !normalized.completed && !activeFound

    if (active) {
      activeFound = true
    }

    return { ...normalized, active }
  })
}
