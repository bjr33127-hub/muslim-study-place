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
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

type AttributeOption = {
  value: string
  label: string
  icon: RevisionIcon
}

function AttributeSelector({
  className,
  icon: Icon,
  label,
  menuId,
  menuLabel,
  options,
  selectedValue,
  isOpen,
  onToggle,
  onSelect,
}: {
  className: string
  icon: RevisionIcon
  label: string
  menuId: string
  menuLabel: string
  options: AttributeOption[]
  selectedValue: string
  isOpen: boolean
  onToggle: () => void
  onSelect: (value: string) => void
}) {
  return (
    <span className="revision-attribute-control">
      <button
        type="button"
        className={`attribute-pill revision-attribute-trigger ${className}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        onClick={onToggle}
      >
        <Icon size={12} strokeWidth={2} />
        <span>{label}</span>
      </button>
      {isOpen ? (
        <div id={menuId} className="revision-attribute-menu" role="menu" aria-label={menuLabel}>
          {options.map((option) => {
            const OptionIcon = option.icon

            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selectedValue === option.value}
                className={selectedValue === option.value ? 'is-selected' : ''}
                onClick={() => onSelect(option.value)}
              >
                <OptionIcon size={13} strokeWidth={2} />
                {option.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </span>
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
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const dashboardRef = useRef<HTMLDivElement>(null)
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
  const selectedSubject = subjects.find((subject) => subject.id === subjectId)
  const selectedSubjectLabel = subjectId === 'none'
    ? copy.noSubject
    : selectedSubject?.name ?? copy.allSubjects
  const filterSummary = `${todoCopy.filters[filter]} / ${selectedSubjectLabel}`

  useEffect(() => {
    if (!openMenu) {
      return undefined
    }

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!dashboardRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openMenu])

  return (
    <div ref={dashboardRef} className="revision-dashboard">
      <div className="revision-section-heading">
        <Flame size={16} strokeWidth={1.8} />
        <span>{copy.dashboardTitle}</span>
      </div>
      <div className="todo-toolbar revision-toolbar">
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
        <div className="revision-filter-control">
          <button
            type="button"
            className={`todo-sort-select revision-filter-trigger${openMenu === 'filter' ? ' is-open' : ''}`}
            aria-label={copy.filter}
            aria-expanded={openMenu === 'filter'}
            aria-haspopup="menu"
            aria-controls={openMenu === 'filter' ? 'revision-filter-menu' : undefined}
            onClick={() => setOpenMenu((current) => current === 'filter' ? null : 'filter')}
          >
            <SlidersHorizontal size={14} strokeWidth={1.8} />
            <span>{filterSummary}</span>
          </button>
          {openMenu === 'filter' ? (
            <div id="revision-filter-menu" className="revision-filter-menu" role="menu" aria-label={todoCopy.filterAria}>
              <label className="todo-search revision-filter-search">
                <Search size={14} strokeWidth={1.8} />
                <input
                  value={query}
                  aria-label={todoCopy.search}
                  placeholder={todoCopy.searchPlaceholder}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="revision-filter-menu-section">
                <span>{copy.filterStatus}</span>
                <div>
                  {FILTERS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="menuitemradio"
                      aria-checked={filter === item}
                      className={filter === item ? 'is-selected' : ''}
                      onClick={() => setFilter(item)}
                    >
                      {todoCopy.filters[item]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="revision-filter-menu-section">
                <span>{copy.subject}</span>
                <div>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={!subjectId}
                    className={!subjectId ? 'is-selected' : ''}
                    onClick={() => setSubjectId('')}
                  >
                    {copy.allSubjects}
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={subjectId === 'none'}
                    className={subjectId === 'none' ? 'is-selected' : ''}
                    onClick={() => setSubjectId('none')}
                  >
                    {copy.noSubject}
                  </button>
                  {subjects.map((subject) => (
                    <button
                      key={subject.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={subjectId === subject.id}
                      className={subjectId === subject.id ? 'is-selected' : ''}
                      onClick={() => setSubjectId(subject.id)}
                    >
                      <i style={{ background: subject.color }} aria-hidden="true" />
                      {subject.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
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
          const priorityMenuId = `revision-priority-menu-${event.id}`
          const difficultyMenuId = `revision-difficulty-menu-${event.id}`

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
                <div className="revision-title-line">
                  <span className="revision-kind">{eventLabel(copy, course, event)}</span>
                  <i className="revision-course-dot" style={{ background: course?.color }} aria-hidden="true" />
                  <strong>{title}</strong>
                </div>
                <div className="revision-card-meta">
                  <AttributeSelector
                    className={`priority-pill priority-${event.priority}`}
                    icon={PriorityIcon}
                    label={todoCopy.priorities[event.priority]}
                    menuId={priorityMenuId}
                    menuLabel={todoCopy.priorityAria}
                    selectedValue={event.priority}
                    isOpen={openMenu === priorityMenuId}
                    onToggle={() => setOpenMenu((current) => current === priorityMenuId ? null : priorityMenuId)}
                    onSelect={(value) => {
                      onUpdateEvent(event.id, { priority: value as TodoPriority })
                      setOpenMenu(null)
                    }}
                    options={TODO_PRIORITIES.map((item) => ({
                      value: item,
                      label: todoCopy.priorities[item],
                      icon: priorityIcons[item],
                    }))}
                  />
                  <AttributeSelector
                    className={`difficulty-pill difficulty-${event.difficulty}`}
                    icon={DifficultyIcon}
                    label={todoCopy.difficulties[event.difficulty]}
                    menuId={difficultyMenuId}
                    menuLabel={todoCopy.difficultyAria}
                    selectedValue={event.difficulty}
                    isOpen={openMenu === difficultyMenuId}
                    onToggle={() => setOpenMenu((current) => current === difficultyMenuId ? null : difficultyMenuId)}
                    onSelect={(value) => {
                      onUpdateEvent(event.id, { difficulty: value as TodoDifficulty })
                      setOpenMenu(null)
                    }}
                    options={TODO_DIFFICULTIES.map((item) => ({
                      value: item,
                      label: todoCopy.difficulties[item],
                      icon: difficultyIcons[item],
                    }))}
                  />
                  <small>
                    {course?.part ? `${copy.coursePartVisible(course.part)} · ` : ''}
                    {formatShortDate(event.scheduledDate)}
                    {event.scheduledTime ? ` ${event.scheduledTime}` : ''} -{' '}
                    {copy.statuses[status]}
                  </small>
                </div>
              </div>

              <div className="revision-card-tools">
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
