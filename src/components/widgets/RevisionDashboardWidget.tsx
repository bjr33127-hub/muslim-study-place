import {
  Archive,
  CalendarCheck,
  CheckCircle2,
  Dumbbell,
  Feather,
  Flame,
  Gauge,
  ListFilter,
  Minus,
  Mountain,
  Pause,
  Play,
  Plus,
  Search,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Siren,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import type { CSSProperties } from 'react'
import type { AppCopy } from '../../lib/i18n'
import {
  courseById,
  dateKey,
  filterAndSortRevisionEvents,
  formatShortDate,
  groupCompletedRevisionEventsByCourse,
  revisionOffsetLabel,
  revisionEventStatusForDay,
  todayRevisionEvents,
} from '../../lib/revisions'
import {
  TODO_DIFFICULTIES,
  TODO_PRIORITIES,
  clampPomodoros,
  type TodoFilter,
  type TodoSortMode,
} from '../../lib/todos'
import type {
  RevisionCourse,
  RevisionEvent,
  RevisionSubject,
  TodoDifficulty,
  TodoPriority,
} from '../../types/app'

const FILTERS: TodoFilter[] = ['active', 'completed', 'all']
const SORT_MODES: TodoSortMode[] = [
  'manual',
  'created-desc',
  'created-asc',
  'name-asc',
  'name-desc',
  'priority',
  'difficulty',
  'status',
  'progress-desc',
  'progress-asc',
  'target-desc',
  'target-asc',
]

type RevisionIcon = ComponentType<{ size?: number; strokeWidth?: number }>

const priorityIcons: Record<TodoPriority, RevisionIcon> = {
  urgent: Siren,
  high: SignalHigh,
  medium: SignalMedium,
  low: SignalLow,
  later: Archive,
}

const difficultyIcons: Record<TodoDifficulty, RevisionIcon> = {
  easy: Feather,
  normal: Gauge,
  hard: Mountain,
  intense: Dumbbell,
}

type RevisionDashboardWidgetProps = {
  copy: AppCopy['revisions']
  todoCopy: AppCopy['todo']
  courses: RevisionCourse[]
  subjects: RevisionSubject[]
  events: RevisionEvent[]
  activeRevisionEventId?: string
  isTimerRunning: boolean
  onStartEvent: (id: string) => void
  onPauseEvent: (id: string) => void
  onMarkDone: (id: string) => void
  onUpdateEvent: (
    id: string,
    patch: Partial<
      Pick<RevisionEvent, 'priority' | 'difficulty' | 'requiredPomodoros'>
    >,
  ) => void
  onOpenPlanner: () => void
}

function eventLabel(
  copy: AppCopy['revisions'],
  course: RevisionCourse | undefined,
  event: RevisionEvent,
) {
  return revisionOffsetLabel(course, event, copy.revisionPrefix)
}

function AttributePill({
  className,
  icon: Icon,
  label,
}: {
  className: string
  icon: RevisionIcon
  label: string
}) {
  return (
    <em className={`attribute-pill ${className}`}>
      <Icon size={12} strokeWidth={2} />
      <span>{label}</span>
    </em>
  )
}

export function RevisionDashboardWidget({
  copy,
  todoCopy,
  courses,
  subjects,
  events,
  activeRevisionEventId,
  isTimerRunning,
  onStartEvent,
  onPauseEvent,
  onMarkDone,
  onUpdateEvent,
  onOpenPlanner,
}: RevisionDashboardWidgetProps) {
  const [filter, setFilter] = useState<TodoFilter>('active')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<TodoSortMode>('manual')
  const [subjectId, setSubjectId] = useState('')
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const today = dateKey()
  const coursesById = useMemo(() => courseById(courses), [courses])
  const todayEvents = useMemo(
    () => todayRevisionEvents(events, today),
    [events, today],
  )
  const visibleEvents = useMemo(
    () => filterAndSortRevisionEvents(todayEvents, courses, filter, query, sortMode, subjectId),
    [courses, filter, query, sortMode, subjectId, todayEvents],
  )
  const activeVisibleEvents = useMemo(
    () =>
      visibleEvents.filter(
        (event) => event.status !== 'done' && event.status !== 'skipped',
      ),
    [visibleEvents],
  )
  const completedGroups = useMemo(
    () => groupCompletedRevisionEventsByCourse(visibleEvents),
    [visibleEvents],
  )
  const visibleCount = activeVisibleEvents.length + completedGroups.length

  return (
    <div className="revision-dashboard">
      <div className="revision-section-heading">
        <Flame size={16} strokeWidth={1.8} />
        <span>{copy.dashboardTitle}</span>
      </div>
      <div className="todo-toolbar revision-toolbar">
        <label className="todo-search">
          <Search size={14} strokeWidth={1.8} />
          <input
            value={query}
            aria-label={todoCopy.search}
            placeholder={todoCopy.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="todo-sort-select">
          <ListFilter size={14} strokeWidth={1.8} />
          <select
            aria-label={todoCopy.sortAria}
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as TodoSortMode)}
          >
            {SORT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {todoCopy.sortModes[mode]}
              </option>
            ))}
          </select>
        </label>
        <label className="todo-sort-select revision-subject-filter">
          <ListFilter size={14} strokeWidth={1.8} />
          <select
            aria-label={copy.subjectFilter}
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
          >
            <option value="">{copy.allSubjects}</option>
            <option value="none">{copy.noSubject}</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="todo-tabs revision-tabs" aria-label={todoCopy.filterAria}>
        {FILTERS.map((item) => (
          <button
            key={item}
            className={filter === item ? 'is-selected' : ''}
            type="button"
            onClick={() => setFilter(item)}
          >
            {todoCopy.filters[item]}
          </button>
        ))}
      </div>

      <div className="revision-today-list">
        {activeVisibleEvents.map((event) => {
          const course = coursesById.get(event.courseId)
          const status = revisionEventStatusForDay(event, today)
          const title = course?.title ?? copy.courseName
          const isActive = event.id === activeRevisionEventId
          const subject = subjects.find((item) => item.id === course?.subjectId)
          const actionLabel = isActive
            ? isTimerRunning
              ? copy.pause
              : copy.resume
            : copy.revise
          const PriorityIcon = priorityIcons[event.priority]
          const DifficultyIcon = difficultyIcons[event.difficulty]
          const isDone = event.status === 'done' || event.status === 'skipped'

          return (
            <article
              key={event.id}
              data-revision-event-id={event.id}
              className={`revision-card status-${status}`}
              style={{
                '--revision-color': subject?.color ?? course?.color,
                '--revision-text-color': subject?.textColor ?? course?.textColor,
              } as CSSProperties}
            >
              <div className="revision-card-main">
                <span className="revision-kind">{eventLabel(copy, course, event)}</span>
                <div className="revision-title-line">
                  <i className="revision-course-dot" style={{ background: course?.color }} aria-hidden="true" />
                  <strong>{title}</strong>
                  <AttributePill
                    className={`priority-pill priority-${event.priority}`}
                    icon={PriorityIcon}
                    label={todoCopy.priorities[event.priority]}
                  />
                  <AttributePill
                    className={`difficulty-pill difficulty-${event.difficulty}`}
                    icon={DifficultyIcon}
                    label={todoCopy.difficulties[event.difficulty]}
                  />
                </div>
                {course?.part ? <small>{copy.coursePartVisible(course.part)}</small> : null}
                <small>
                  {formatShortDate(event.scheduledDate)}
                  {event.scheduledTime ? ` ${event.scheduledTime}` : ''} -{' '}
                  {copy.statuses[status]}
                </small>
              </div>

              <div className="revision-task-meta">
                <label className="todo-priority-select revision-inline-select">
                  <select
                    aria-label={todoCopy.priorityAria}
                    value={event.priority}
                    onChange={(changeEvent) =>
                      onUpdateEvent(event.id, {
                        priority: changeEvent.target.value as TodoPriority,
                      })
                    }
                  >
                    {TODO_PRIORITIES.map((item) => (
                      <option key={item} value={item}>
                        {todoCopy.priorities[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="todo-difficulty-select todo-attribute-select revision-inline-select">
                  <select
                    aria-label={todoCopy.difficultyAria}
                    value={event.difficulty}
                    onChange={(changeEvent) =>
                      onUpdateEvent(event.id, {
                        difficulty: changeEvent.target.value as TodoDifficulty,
                      })
                    }
                  >
                    {TODO_DIFFICULTIES.map((item) => (
                      <option key={item} value={item}>
                        {todoCopy.difficulties[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="goal-stepper small" aria-label={copy.objective}>
                  <button
                    type="button"
                    aria-label={todoCopy.decreaseRequired}
                    onClick={() =>
                      onUpdateEvent(event.id, {
                        requiredPomodoros: clampPomodoros(
                          event.requiredPomodoros - 1,
                        ),
                      })
                    }
                  >
                    <Minus size={13} strokeWidth={1.9} />
                  </button>
                  <strong>{event.requiredPomodoros}</strong>
                  <button
                    type="button"
                    aria-label={todoCopy.increaseRequired}
                    onClick={() =>
                      onUpdateEvent(event.id, {
                        requiredPomodoros: clampPomodoros(
                          event.requiredPomodoros + 1,
                        ),
                      })
                    }
                  >
                    <Plus size={13} strokeWidth={1.9} />
                  </button>
                </div>
              </div>

              <strong className="revision-progress-ratio" aria-label={copy.progress}>
                {event.completedPomodoros}/{event.requiredPomodoros}
              </strong>

              <div className="revision-card-actions">
                <button
                  type="button"
                  className="gold-action small"
                  disabled={isDone}
                  onClick={() => {
                    if (isDone) {
                      return
                    }

                    if (isActive && isTimerRunning) {
                      onPauseEvent(event.id)
                      return
                    }

                    onStartEvent(event.id)
                  }}
                >
                  {isActive && isTimerRunning ? (
                    <Pause size={13} strokeWidth={2} />
                  ) : (
                    <Play size={13} strokeWidth={2} />
                  )}
                  {actionLabel}
                </button>
                <button
                  type="button"
                  className="ghost-action small"
                  disabled={isDone}
                  onClick={() => onMarkDone(event.id)}
                >
                  <CheckCircle2 size={13} strokeWidth={1.9} />
                  {copy.markDone}
                </button>
              </div>
            </article>
          )
        })}

        {completedGroups.map((group) => {
          const course = coursesById.get(group.courseId)
          const first = group.events[0]
          const expanded = openGroups[group.courseId] ?? false

          return (
            <article
              key={`group:${group.courseId}`}
              className="revision-card revision-completed-group status-done"
              style={{
                '--revision-color': course?.color,
                '--revision-text-color': course?.textColor,
              } as CSSProperties}
            >
              <div className="revision-card-main">
                <span className="revision-kind">{copy.completedStack}</span>
                <div className="revision-title-line">
                  <strong>{course?.title ?? copy.courseName}</strong>
                  <em className="revision-stack-count">
                    {copy.completedStackCount(group.events.length)}
                  </em>
                </div>
                {course?.part ? <small>{copy.coursePartVisible(course.part)}</small> : null}
                {first ? (
                  <small>
                    {eventLabel(copy, course, first)} -{' '}
                    {formatShortDate(first.scheduledDate)}
                  </small>
                ) : null}
              </div>

              <button
                className="ghost-action small"
                type="button"
                onClick={() =>
                  setOpenGroups((current) => ({
                    ...current,
                    [group.courseId]: !expanded,
                  }))
                }
              >
                {expanded ? copy.hideCompletedStack : copy.showCompletedStack}
              </button>

              {expanded ? (
                <div className="revision-completed-runs">
                  {group.events.map((event) => (
                    <span key={event.id}>
                      {eventLabel(copy, course, event)} -{' '}
                      {formatShortDate(event.scheduledDate)}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          )
        })}

        {!visibleCount ? (
          <div className="revision-empty">
            <Sparkles size={18} strokeWidth={1.8} />
            <strong>{copy.todayEmpty}</strong>
            <span>{copy.todayEmptyHint}</span>
            <div className="empty-action-row">
              <button className="gold-action small" type="button" onClick={onOpenPlanner}>
                <Plus size={13} strokeWidth={2} />
                {copy.addFirstCourse}
              </button>
              <button className="ghost-action small" type="button" onClick={onOpenPlanner}>
                <CalendarCheck size={13} strokeWidth={1.9} />
                {copy.openPlanner}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
