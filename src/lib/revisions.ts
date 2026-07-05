import type {
  RevisionCourse,
  RevisionEvent,
  RevisionEventStatus,
  RevisionMethod,
  RevisionSettings,
  RevisionWeekday,
  GoogleCalendarSyncState,
  TodoItem,
} from '../types/app'
import { DEFAULT_GOOGLE_CALENDAR_SYNC } from './defaults'
import {
  clampPomodoros,
  compareTodos,
  normalizeDifficulty,
  normalizePriority,
  type TodoFilter,
  type TodoSortMode,
} from './todos'

export const REVISION_TASK_WINDOW_ID = 'revision-tasks'

export const DEFAULT_REVISION_METHODS: RevisionMethod[] = [
  {
    id: 'method-classic',
    name: 'Revision classique',
    offsetDays: [3, 10, 30, 60],
    builtIn: true,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'method-monthly',
    name: 'Revision mensuelle',
    offsetDays: [3, 7, 14, 30],
    builtIn: true,
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: 'method-fast',
    name: 'Revision rapide',
    offsetDays: [2, 7, 14],
    builtIn: true,
    createdAt: 3,
    updatedAt: 3,
  },
]

export const REVISION_COLOR_PRESETS = [
  { id: 'base', label: 'Base', color: '#d9b66c', textColor: '#14110b' },
  { id: 'red', label: 'Rouge', color: '#ff6b6b', textColor: '#140606' },
  { id: 'orange', label: 'Orange', color: '#ff9f43', textColor: '#160b02' },
  { id: 'amber', label: 'Ambre', color: '#f6c24e', textColor: '#151006' },
  { id: 'green', label: 'Vert', color: '#45d67a', textColor: '#031208' },
  { id: 'teal', label: 'Turquoise', color: '#3ed7c5', textColor: '#021110' },
  { id: 'blue', label: 'Bleu', color: '#6ea8ff', textColor: '#030b18' },
  { id: 'violet', label: 'Violet', color: '#a987ff', textColor: '#0d0718' },
  { id: 'pink', label: 'Rose', color: '#ff77b7', textColor: '#180611' },
] as const

export const REVISION_WEEKDAYS: RevisionWeekday[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]

function cleanNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function cleanText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function dateKey(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    const now = new Date()

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  )
}

export function normalizeDateKey(value: unknown, fallback = dateKey()) {
  return isDateKey(value) ? value : fallback
}

export function parseDateKey(value: string) {
  if (!isDateKey(value)) {
    return new Date()
  }

  const [year, month, day] = value.split('-').map(Number)

  return new Date(year, month - 1, day)
}

export function normalizeRevisionTime(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())

  if (!match) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }

  return `${pad(hours)}:${pad(minutes)}`
}

export function timeKey(date: Date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null
  }

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function revisionEventStart(event: RevisionEvent) {
  return event.scheduledTime
    ? `${event.scheduledDate}T${event.scheduledTime}:00`
    : event.scheduledDate
}

export function addDaysToDateKey(value: string, days: number) {
  const date = parseDateKey(value)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

export function compareDateKeys(first: string, second: string) {
  return parseDateKey(first).getTime() - parseDateKey(second).getTime()
}

export function daysBetweenDateKeys(first: string, second: string) {
  const firstDate = parseDateKey(first)
  const secondDate = parseDateKey(second)
  firstDate.setHours(0, 0, 0, 0)
  secondDate.setHours(0, 0, 0, 0)

  return Math.max(
    0,
    Math.round((secondDate.getTime() - firstDate.getTime()) / 86_400_000),
  )
}

export function revisionOffsetDays(
  course: RevisionCourse | undefined,
  event: RevisionEvent,
) {
  return course
    ? daysBetweenDateKeys(course.initialDate, event.scheduledDate)
    : event.reviewIndex
}

export function revisionOffsetLabel(
  course: RevisionCourse | undefined,
  event: RevisionEvent,
  prefix = 'Revision',
) {
  return `${prefix} J+${revisionOffsetDays(course, event)}`
}

export function formatShortDate(value: string, locale?: string) {
  return parseDateKey(value).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  })
}

export function weekdayFromDateKey(value: string): RevisionWeekday {
  const day = parseDateKey(value).getDay()
  return REVISION_WEEKDAYS[(day + 6) % 7]
}

export function weekStartKey(value = dateKey()) {
  const date = parseDateKey(value)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return dateKey(date)
}

export function weekDaysFromStart(startKey: string) {
  return REVISION_WEEKDAYS.map((_, index) => addDaysToDateKey(startKey, index))
}

export function normalizeRevisionOffsets(value: unknown) {
  const raw = Array.isArray(value) ? value : []
  const unique = new Set<number>()

  raw.forEach((item) => {
    const rounded = Math.round(Number(item))

    if (Number.isFinite(rounded) && rounded > 0) {
      unique.add(Math.min(rounded, 365))
    }
  })

  return Array.from(unique).sort((first, second) => first - second)
}

export function normalizeRevisionMethods(value: unknown): RevisionMethod[] {
  const raw = Array.isArray(value) ? value : []
  const custom = raw.flatMap((item, index) => {
    const candidate = item as Partial<RevisionMethod>
    const name = cleanText(candidate.name)
    const offsetDays = normalizeRevisionOffsets(candidate.offsetDays)

    if (!name || !offsetDays.length) {
      return []
    }

    const id =
      typeof candidate.id === 'string' && candidate.id
        ? candidate.id
        : `method-${Date.now()}-${index}`

    if (DEFAULT_REVISION_METHODS.some((method) => method.id === id)) {
      return []
    }

    const createdAt = cleanNumber(candidate.createdAt, Date.now())

    return [
      {
        id,
        name,
        offsetDays,
        builtIn: false,
        createdAt,
        updatedAt: cleanNumber(candidate.updatedAt, createdAt),
      },
    ]
  })

  return [...DEFAULT_REVISION_METHODS, ...custom]
}

function normalizeWeekdays(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value.filter((item): item is RevisionWeekday =>
        REVISION_WEEKDAYS.includes(item as RevisionWeekday),
      ),
    ),
  )
}

function normalizeColor(value: unknown, fallback: string) {
  const text = cleanText(value)

  if (/^#[0-9a-f]{6}$/i.test(text)) {
    return text
  }

  return fallback
}

export function normalizeRevisionCourses(value: unknown): RevisionCourse[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item, index) => {
    const candidate = item as Partial<RevisionCourse>
    const title = cleanText(candidate.title)

    if (!title) {
      return []
    }

    const createdAt = cleanNumber(candidate.createdAt, Date.now())
    const preset = REVISION_COLOR_PRESETS[index % REVISION_COLOR_PRESETS.length]

    return [
      {
        id:
          typeof candidate.id === 'string' && candidate.id
            ? candidate.id
            : `revision-course-${Date.now()}-${index}`,
        title,
        initialDate:
          normalizeDateKey(candidate.initialDate),
        professor: cleanText(candidate.professor),
        part: cleanText(candidate.part),
        notes: cleanText(candidate.notes),
        color: normalizeColor(candidate.color, preset.color),
        textColor: normalizeColor(candidate.textColor, preset.textColor),
        methodId:
          typeof candidate.methodId === 'string' && candidate.methodId
            ? candidate.methodId
            : null,
        excludedWeekdays: normalizeWeekdays(candidate.excludedWeekdays),
        createdAt,
        updatedAt: cleanNumber(candidate.updatedAt, createdAt),
      },
    ]
  })
}

export function normalizeRevisionEvents(value: unknown): RevisionEvent[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item, index) => {
    const candidate = item as Partial<RevisionEvent>

    if (
      typeof candidate.courseId !== 'string' ||
      !candidate.courseId ||
      typeof candidate.scheduledDate !== 'string' ||
      !candidate.scheduledDate
    ) {
      return []
    }

    const requiredPomodoros = clampPomodoros(candidate.requiredPomodoros ?? 1)
    const completedPomodoros = Math.min(
      Math.max(Math.round(cleanNumber(candidate.completedPomodoros, 0)), 0),
      requiredPomodoros,
    )
    const storedStatus: RevisionEventStatus =
      candidate.status === 'active' ||
      candidate.status === 'done' ||
      candidate.status === 'skipped'
        ? candidate.status
        : 'pending'
    const status: RevisionEventStatus =
      storedStatus !== 'skipped' && completedPomodoros >= requiredPomodoros
        ? 'done'
        : storedStatus

    return [
      {
        id:
          typeof candidate.id === 'string' && candidate.id
            ? candidate.id
            : `${candidate.courseId}:event:${index}`,
        courseId: candidate.courseId,
        scheduledDate: normalizeDateKey(candidate.scheduledDate),
        scheduledTime: normalizeRevisionTime(candidate.scheduledTime),
        kind: candidate.kind === 'review' ? 'review' : 'initial',
        reviewIndex: Math.max(0, Math.round(cleanNumber(candidate.reviewIndex, 0))),
        totalReviews: Math.max(0, Math.round(cleanNumber(candidate.totalReviews, 0))),
        status,
        priority: normalizePriority(candidate.priority),
        difficulty: normalizeDifficulty(candidate.difficulty),
        requiredPomodoros,
        completedPomodoros,
        linkedTodoId:
          typeof candidate.linkedTodoId === 'string' && candidate.linkedTodoId
            ? candidate.linkedTodoId
            : undefined,
        completedAt:
          status === 'done' ? cleanNumber(candidate.completedAt, Date.now()) : null,
        timeSpentSeconds: Math.max(
          0,
          Math.round(cleanNumber(candidate.timeSpentSeconds, 0)),
        ),
      },
    ]
  })
}

export function normalizeRevisionSettings(value: unknown): RevisionSettings {
  const candidate = value as Partial<RevisionSettings>

  return {
    selectedWeekStart:
      typeof candidate?.selectedWeekStart === 'string' &&
      candidate.selectedWeekStart
        ? weekStartKey(candidate.selectedWeekStart)
        : null,
    plannerView:
      candidate?.plannerView === 'timeGridWeek' ||
      candidate?.plannerView === 'timeGridDay' ||
      candidate?.plannerView === 'listWeek'
        ? candidate.plannerView
        : 'dayGridMonth',
    plannerDate:
      isDateKey(candidate?.plannerDate)
        ? candidate.plannerDate
        : null,
  }
}

export function normalizeGoogleCalendarSync(value: unknown): GoogleCalendarSyncState {
  const candidate = value as Partial<GoogleCalendarSyncState>
  const rawMap =
    candidate?.eventMap && typeof candidate.eventMap === 'object'
      ? candidate.eventMap
      : {}
  const eventMap = Object.fromEntries(
    Object.entries(rawMap).flatMap(([eventId, rawLink]) => {
      const link =
        rawLink as Partial<GoogleCalendarSyncState['eventMap'][string]>

      if (
        typeof link?.revisionEventId !== 'string' ||
        typeof link.googleEventId !== 'string'
      ) {
        return []
      }

      return [
        [
          eventId,
          {
            revisionEventId: link.revisionEventId,
            googleEventId: link.googleEventId,
            syncedAt: cleanNumber(link.syncedAt, 0),
          },
        ],
      ]
    }),
  )

  return {
    ...DEFAULT_GOOGLE_CALENDAR_SYNC,
    enabled: candidate?.enabled === true,
    lastSyncedAt:
      typeof candidate?.lastSyncedAt === 'number' &&
      Number.isFinite(candidate.lastSyncedAt)
        ? candidate.lastSyncedAt
        : null,
    lastError:
      typeof candidate?.lastError === 'string' && candidate.lastError.trim()
        ? candidate.lastError.trim()
        : null,
    lastSummary:
      candidate?.lastSummary && typeof candidate.lastSummary === 'object'
        ? {
            created: cleanNumber(candidate.lastSummary.created, 0),
            updated: cleanNumber(candidate.lastSummary.updated, 0),
            deleted: cleanNumber(candidate.lastSummary.deleted, 0),
            repaired: cleanNumber(candidate.lastSummary.repaired, 0),
            skipped: cleanNumber(candidate.lastSummary.skipped, 0),
          }
        : null,
    eventMap,
  }
}

function shiftPastExcluded(dateValue: string, excludedWeekdays: RevisionWeekday[]) {
  if (!excludedWeekdays.length || excludedWeekdays.length >= REVISION_WEEKDAYS.length) {
    return dateValue
  }

  let next = dateValue
  let guard = 0

  while (excludedWeekdays.includes(weekdayFromDateKey(next)) && guard < 14) {
    next = addDaysToDateKey(next, 1)
    guard += 1
  }

  return next
}

function preserveEvent(
  event: RevisionEvent,
  existingById: Map<string, RevisionEvent>,
) {
  const existing = existingById.get(event.id)

  if (!existing) {
    return event
  }

  return {
    ...event,
    status: existing.status,
    linkedTodoId: existing.linkedTodoId,
    scheduledTime: existing.scheduledTime,
    completedAt: existing.completedAt,
    timeSpentSeconds: existing.timeSpentSeconds,
    priority: existing.priority,
    difficulty: existing.difficulty,
    requiredPomodoros: existing.requiredPomodoros,
    completedPomodoros: existing.completedPomodoros,
  }
}

function defaultRevisionTaskFields() {
  return {
    priority: 'medium' as const,
    difficulty: 'normal' as const,
    requiredPomodoros: 1,
    completedPomodoros: 0,
  }
}

export function buildRevisionEventsForCourse(
  course: RevisionCourse,
  method: RevisionMethod | null | undefined,
  existingEvents: RevisionEvent[] = [],
): RevisionEvent[] {
  const offsets = method ? normalizeRevisionOffsets(method.offsetDays) : []
  const existingById = new Map(existingEvents.map((event) => [event.id, event]))
  const totalReviews = offsets.length
  const initial: RevisionEvent = {
    id: `${course.id}:initial`,
    courseId: course.id,
    scheduledDate: course.initialDate,
    scheduledTime: null,
    kind: 'initial',
    reviewIndex: 0,
    totalReviews,
    status: 'pending',
    ...defaultRevisionTaskFields(),
    completedAt: null,
    timeSpentSeconds: 0,
  }
  const reviews = offsets.map((offset, index) => {
    const scheduledDate = shiftPastExcluded(
      addDaysToDateKey(course.initialDate, offset),
      course.excludedWeekdays,
    )

    return {
      id: `${course.id}:review:${index + 1}`,
      courseId: course.id,
      scheduledDate,
      scheduledTime: null,
      kind: 'review' as const,
      reviewIndex: index + 1,
      totalReviews,
      status: 'pending' as const,
      ...defaultRevisionTaskFields(),
      completedAt: null,
      timeSpentSeconds: 0,
    }
  })

  return [initial, ...reviews]
    .map((event) => preserveEvent(event, existingById))
    .sort((first, second) =>
      compareDateKeys(first.scheduledDate, second.scheduledDate) ||
      first.reviewIndex - second.reviewIndex,
    )
}

export function buildRevisionEventsForCourses(
  courses: RevisionCourse[],
  methods: RevisionMethod[],
  existingEvents: RevisionEvent[] = [],
) {
  const methodsById = methodById(methods)

  return courses
    .flatMap((course) =>
      buildRevisionEventsForCourse(
        course,
        course.methodId ? methodsById.get(course.methodId) : null,
        existingEvents.filter((event) => event.courseId === course.id),
      ),
    )
    .sort((first, second) =>
      compareDateKeys(first.scheduledDate, second.scheduledDate) ||
      first.courseId.localeCompare(second.courseId) ||
      first.reviewIndex - second.reviewIndex,
    )
}

export function revisionEventStatusForDay(event: RevisionEvent, today = dateKey()) {
  if (event.status === 'done' || event.status === 'active' || event.status === 'skipped') {
    return event.status
  }

  return compareDateKeys(event.scheduledDate, today) < 0 ? 'overdue' : 'pending'
}

export function eventsForWeek(events: RevisionEvent[], startKey: string) {
  const days = new Set(weekDaysFromStart(startKey))

  return events
    .filter((event) => days.has(event.scheduledDate))
    .sort((first, second) =>
      compareDateKeys(first.scheduledDate, second.scheduledDate) ||
      first.reviewIndex - second.reviewIndex,
    )
}

export function revisionsDueToday(events: RevisionEvent[], today = dateKey()) {
  return events
    .filter((event) => {
      if (event.status === 'done' || event.status === 'skipped') {
        return false
      }

      return compareDateKeys(event.scheduledDate, today) <= 0
    })
    .sort((first, second) =>
      compareDateKeys(first.scheduledDate, second.scheduledDate) ||
      first.reviewIndex - second.reviewIndex,
    )
}

export function todayRevisionEvents(events: RevisionEvent[], today = dateKey()) {
  return events
    .filter((event) => event.scheduledDate === today)
    .sort((first, second) =>
      compareDateKeys(first.scheduledDate, second.scheduledDate) ||
      first.reviewIndex - second.reviewIndex,
    )
}

export type CompletedRevisionGroup = {
  courseId: string
  events: RevisionEvent[]
}

export function groupCompletedRevisionEventsByCourse(events: RevisionEvent[]) {
  const groups = new Map<string, RevisionEvent[]>()

  events.forEach((event) => {
    if (event.status !== 'done') {
      return
    }

    groups.set(event.courseId, [...(groups.get(event.courseId) ?? []), event])
  })

  return Array.from(groups.entries())
    .map(([courseId, groupEvents]): CompletedRevisionGroup => ({
      courseId,
      events: groupEvents.sort(
        (first, second) =>
          (second.completedAt ?? 0) - (first.completedAt ?? 0) ||
          second.reviewIndex - first.reviewIndex,
      ),
    }))
    .sort(
      (first, second) =>
        (second.events[0]?.completedAt ?? 0) -
        (first.events[0]?.completedAt ?? 0),
    )
}

function matchesRevisionQuery(
  event: RevisionEvent,
  coursesById: Map<string, RevisionCourse>,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  if (!normalizedQuery) {
    return true
  }

  const course = coursesById.get(event.courseId)
  const haystack = [
    course?.title,
    course?.part,
    course?.professor,
    event.kind,
    event.scheduledDate,
    event.scheduledTime,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()

  return haystack.includes(normalizedQuery)
}

function revisionComparableTodo(
  event: RevisionEvent,
  coursesById: Map<string, RevisionCourse>,
): TodoItem {
  const course = coursesById.get(event.courseId)
  const scheduledAt = parseDateKey(event.scheduledDate).getTime()

  return {
    id: event.id,
    text: course?.title ?? 'Revision',
    priority: event.priority,
    difficulty: event.difficulty,
    rank: scheduledAt + event.reviewIndex,
    completed: event.status === 'done',
    active: event.status === 'active',
    requiredPomodoros: event.requiredPomodoros,
    completedPomodoros: event.completedPomodoros,
    createdAt: course?.createdAt ?? scheduledAt,
    updatedAt: event.completedAt ?? course?.updatedAt ?? scheduledAt,
    completedAt: event.completedAt,
    repeatIndex: event.reviewIndex,
  }
}

export function filterAndSortRevisionEvents(
  events: RevisionEvent[],
  courses: RevisionCourse[],
  filter: TodoFilter,
  query = '',
  sortMode: TodoSortMode = 'manual',
) {
  const coursesById = courseById(courses)

  return [...events]
    .filter((event) => {
      if (!matchesRevisionQuery(event, coursesById, query)) {
        return false
      }

      const completed = event.status === 'done' || event.status === 'skipped'

      if (filter === 'active') {
        return !completed
      }

      if (filter === 'completed') {
        return completed
      }

      return true
    })
    .sort((first, second) => {
      if (filter === 'all') {
        const firstCompleted = first.status === 'done' || first.status === 'skipped'
        const secondCompleted = second.status === 'done' || second.status === 'skipped'

        if (firstCompleted !== secondCompleted) {
          return firstCompleted ? 1 : -1
        }
      }

      return compareTodos(
        revisionComparableTodo(first, coursesById),
        revisionComparableTodo(second, coursesById),
        sortMode,
      )
    })
}

export function revisionCounts(events: RevisionEvent[]) {
  return events.reduce(
    (counts, event) => {
      if (event.status === 'done' || event.status === 'skipped') {
        counts.completed += 1
      } else {
        counts.active += 1
      }

      return counts
    },
    { active: 0, completed: 0 },
  )
}

export function completedEventsToday(events: RevisionEvent[], today = dateKey()) {
  return events.filter((event) => {
    if (event.status !== 'done') {
      return false
    }

    if (event.completedAt) {
      return dateKey(new Date(event.completedAt)) === today
    }

    return event.scheduledDate === today
  })
}

export function completedEventsThisWeek(events: RevisionEvent[], startKey: string) {
  const days = new Set(weekDaysFromStart(startKey))

  return events.filter((event) => {
    if (event.status !== 'done') {
      return false
    }

    if (event.completedAt) {
      return days.has(dateKey(new Date(event.completedAt)))
    }

    return days.has(event.scheduledDate)
  })
}

export function methodLabel(method: RevisionMethod) {
  return method.offsetDays.map((day) => `J+${day}`).join(', ')
}

export function courseById(courses: RevisionCourse[]) {
  return new Map(courses.map((course) => [course.id, course]))
}

export function methodById(methods: RevisionMethod[]) {
  return new Map(methods.map((method) => [method.id, method]))
}

export function hydrateRevisionEventsFromLinkedTodos(
  events: RevisionEvent[],
  todos: TodoItem[],
) {
  const todosById = new Map(todos.map((todo) => [todo.id, todo]))

  return events.map((event): RevisionEvent => {
    if (!event.linkedTodoId) {
      return event
    }

    const todo = todosById.get(event.linkedTodoId)

    if (!todo) {
      return event
    }

    const requiredPomodoros = clampPomodoros(todo.requiredPomodoros)
    const completedPomodoros = Math.min(
      Math.max(todo.completedPomodoros, 0),
      requiredPomodoros,
    )

    const status: RevisionEvent['status'] =
      event.status === 'done' || completedPomodoros >= requiredPomodoros
        ? 'done'
        : event.status

    return {
      ...event,
      priority: todo.priority,
      difficulty: todo.difficulty,
      requiredPomodoros,
      completedPomodoros,
      status,
      completedAt:
        event.completedAt ??
        (completedPomodoros >= requiredPomodoros ? todo.completedAt : null),
    }
  })
}
