import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  CirclePause,
  CirclePlay,
  Dumbbell,
  Edit3,
  Feather,
  Gauge,
  GripVertical,
  ListFilter,
  Minus,
  Mountain,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Siren,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ComponentType,
  FormEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { AppCopy } from '../../lib/i18n'
import {
  TODO_DIFFICULTIES,
  TODO_PRIORITIES,
  type CompletedTodoGroup,
  type TodoFilter,
  type TodoSortMode,
  clampPomodoros,
  compareTodos,
  filterAndSortTodos,
  groupCompletedTodos,
  todoCounts,
  todoRootId,
} from '../../lib/todos'
import type { TodoDifficulty, TodoItem, TodoPriority } from '../../types/app'

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

type TodoIcon = ComponentType<{ size?: number; strokeWidth?: number }>

type EditDraft = {
  text: string
  priority: TodoPriority
  difficulty: TodoDifficulty
  requiredPomodoros: number
}

type TodoRenderEntry =
  | {
      kind: 'open'
      todo: TodoItem
    }
  | {
      kind: 'completed'
      group: CompletedTodoGroup
    }

type TodoWidgetProps = {
  copy: AppCopy['todo']
  windowTitle: string
  canDeleteWindow: boolean
  todos: TodoItem[]
  activeTaskId?: string
  isTimerRunning: boolean
  onRenameWindow: (title: string) => void
  onDeleteWindow: () => void
  onAddTask: (
    text: string,
    requiredPomodoros: number,
    priority: TodoPriority,
    difficulty: TodoDifficulty,
  ) => void
  onUpdateTask: (
    id: string,
    patch: Partial<
      Pick<TodoItem, 'text' | 'priority' | 'difficulty' | 'requiredPomodoros'>
    >,
  ) => void
  onToggleTask: (id: string) => void
  onDeleteTask: (id: string) => void
  onDeleteTasks: (ids: string[]) => void
  onReorderTask: (sourceId: string, targetId: string) => void
  onRepeatTask: (id: string) => void
  onSetActive: (id: string) => void
  onStartTaskTimer: (id: string) => void
  onPauseTaskTimer: (id: string) => void
}

function progressRatio(completedPomodoros: number, requiredPomodoros: number) {
  return Math.min(completedPomodoros / Math.max(requiredPomodoros, 1), 1)
}

function formattedDate(value: number | null) {
  if (!value) {
    return ''
  }

  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

function progressClass(progress: number) {
  return `pomodoro-progress${progress > 0 ? ' has-progress' : ' is-empty'}${
    progress >= 1 ? ' is-complete' : ''
  }`
}

const priorityIcons: Record<TodoPriority, TodoIcon> = {
  urgent: Siren,
  high: SignalHigh,
  medium: SignalMedium,
  low: SignalLow,
  later: Archive,
}

const difficultyIcons: Record<TodoDifficulty, TodoIcon> = {
  easy: Feather,
  normal: Gauge,
  hard: Mountain,
  intense: Dumbbell,
}

function comparableCompletedGroup(group: CompletedTodoGroup): TodoItem {
  return {
    ...group.template,
    completed: true,
    completedPomodoros: group.totalCompletedPomodoros,
    requiredPomodoros: group.totalRequiredPomodoros,
    completedAt: group.latestCompletedAt,
    updatedAt: group.latestCompletedAt ?? group.template.updatedAt,
  }
}

function comparableEntry(entry: TodoRenderEntry): TodoItem {
  return entry.kind === 'open'
    ? entry.todo
    : comparableCompletedGroup(entry.group)
}

function AttributePill({
  className,
  icon: Icon,
  label,
}: {
  className: string
  icon: TodoIcon
  label: string
}) {
  return (
    <em className={`attribute-pill ${className}`}>
      <Icon size={12} strokeWidth={2} />
      <span>{label}</span>
    </em>
  )
}

function CompletedStack({ count, label }: { count: number; label: string }) {
  return (
    <span
      className={`todo-stack-illustration${count > 1 ? ' is-stacked' : ''}`}
      role="img"
      aria-label={label}
    >
      <span className="todo-stack-card is-back" aria-hidden="true" />
      <span className="todo-stack-card is-middle" aria-hidden="true" />
      <span className="todo-stack-card is-front" aria-hidden="true">
        <Check size={13} strokeWidth={2.2} />
      </span>
      {count > 1 ? <strong aria-hidden="true">{count}</strong> : null}
    </span>
  )
}

export function TodoWidget({
  copy,
  windowTitle,
  canDeleteWindow,
  todos,
  activeTaskId,
  isTimerRunning,
  onRenameWindow,
  onDeleteWindow,
  onAddTask,
  onUpdateTask,
  onToggleTask,
  onDeleteTask,
  onDeleteTasks,
  onReorderTask,
  onRepeatTask,
  onSetActive,
  onStartTaskTimer,
  onPauseTaskTimer,
}: TodoWidgetProps) {
  const [draft, setDraft] = useState('')
  const [titleDraftState, setTitleDraftState] = useState({
    source: windowTitle,
    value: windowTitle,
  })
  const [requiredPomodoros, setRequiredPomodoros] = useState(1)
  const [priority, setPriority] = useState<TodoPriority>('medium')
  const [difficulty, setDifficulty] = useState<TodoDifficulty>('normal')
  const [filter, setFilter] = useState<TodoFilter>('active')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<TodoSortMode>('manual')
  const [draggedId, setDraggedId] = useState('')
  const [dragOverId, setDragOverId] = useState('')
  const dragSourceRef = useRef('')
  const dragTargetRef = useRef('')
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState('')
  const [editDraft, setEditDraft] = useState<EditDraft>({
    text: '',
    priority: 'medium',
    difficulty: 'normal',
    requiredPomodoros: 1,
  })
  const activeTodos = useMemo(
    () => filterAndSortTodos(todos, 'active', query, sortMode),
    [query, sortMode, todos],
  )
  const completedGroups = useMemo(
    () => groupCompletedTodos(todos, query, sortMode),
    [query, sortMode, todos],
  )
  const openTodoRootIds = useMemo(
    () =>
      new Set(
        todos
          .filter((todo) => !todo.completed)
          .map((todo) => todoRootId(todo)),
      ),
    [todos],
  )
  const allTodoEntries = useMemo(() => {
    const entries: TodoRenderEntry[] = [
      ...activeTodos.map((todo) => ({ kind: 'open' as const, todo })),
      ...completedGroups.map((group) => ({
        kind: 'completed' as const,
        group,
      })),
    ]

    if (sortMode === 'manual') {
      return entries
    }

    return [...entries].sort((first, second) =>
      compareTodos(comparableEntry(first), comparableEntry(second), sortMode),
    )
  }, [activeTodos, completedGroups, sortMode])
  const visibleActiveTodos = filter === 'active' ? activeTodos : []
  const visibleCompletedGroups = filter === 'completed' ? completedGroups : []
  const visibleAllEntries = filter === 'all' ? allTodoEntries : []
  const counts = useMemo(() => todoCounts(todos), [todos])
  const canDrag = sortMode === 'manual'

  useEffect(
    () => () => {
      dragCleanupRef.current?.()
    },
    [],
  )

  const addTodo = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()

    if (!text) {
      return
    }

    onAddTask(text, requiredPomodoros, priority, difficulty)
    setDraft('')
  }

  const titleDraft =
    titleDraftState.source === windowTitle ? titleDraftState.value : windowTitle

  const setTitleDraft = (value: string) => {
    setTitleDraftState({
      source: windowTitle,
      value,
    })
  }

  const saveWindowTitle = () => {
    const nextTitle = titleDraft.trim()

    if (!nextTitle || nextTitle === windowTitle) {
      setTitleDraftState({
        source: windowTitle,
        value: windowTitle,
      })
      return
    }

    onRenameWindow(nextTitle)
    setTitleDraftState({
      source: nextTitle,
      value: nextTitle,
    })
  }

  const shiftGoal = (delta: number) => {
    setRequiredPomodoros((current) => clampPomodoros(current + delta))
  }

  const beginEdit = (todo: TodoItem) => {
    setEditingId(todo.id)
    setEditDraft({
      text: todo.text,
      priority: todo.priority,
      difficulty: todo.difficulty,
      requiredPomodoros: todo.requiredPomodoros,
    })
  }

  const shiftEditGoal = (delta: number) => {
    setEditDraft((current) => ({
      ...current,
      requiredPomodoros: clampPomodoros(current.requiredPomodoros + delta),
    }))
  }

  const saveEdit = (event: FormEvent) => {
    event.preventDefault()

    if (!editingId) {
      return
    }

    onUpdateTask(editingId, editDraft)
    setEditingId('')
  }

  const updateDragTarget = (clientX: number, clientY: number) => {
    const targetRow = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('.todo-row[data-todo-id]:not(.todo-group-row)')
    const targetId = targetRow?.dataset.todoId ?? ''
    const nextTargetId =
      targetId && targetId !== dragSourceRef.current ? targetId : ''

    if (dragTargetRef.current === nextTargetId) {
      return
    }

    dragTargetRef.current = nextTargetId
    setDragOverId(nextTargetId)
  }

  const removePointerDragListeners = () => {
    dragCleanupRef.current?.()
    dragCleanupRef.current = null
  }

  const finishPointerDrag = () => {
    const sourceId = dragSourceRef.current
    const targetId = dragTargetRef.current

    removePointerDragListeners()

    if (canDrag && sourceId && targetId && targetId !== sourceId) {
      onReorderTask(sourceId, targetId)
    }

    clearDrag()
  }

  const cancelPointerDrag = () => {
    removePointerDragListeners()
    clearDrag()
  }

  const startPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    todoId: string,
  ) => {
    if (!canDrag) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    removePointerDragListeners()
    dragSourceRef.current = todoId
    dragTargetRef.current = ''
    setDraggedId(todoId)
    setDragOverId('')

    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      if (!dragSourceRef.current) {
        return
      }

      moveEvent.preventDefault()
      updateDragTarget(moveEvent.clientX, moveEvent.clientY)
    }

    const handlePointerEnd = (endEvent: globalThis.PointerEvent) => {
      endEvent.preventDefault()
      finishPointerDrag()
    }

    const handlePointerCancel = (cancelEvent: globalThis.PointerEvent) => {
      cancelEvent.preventDefault()
      cancelPointerDrag()
    }

    document.addEventListener('pointermove', handlePointerMove, { passive: false })
    document.addEventListener('pointerup', handlePointerEnd, { passive: false })
    document.addEventListener('pointercancel', handlePointerCancel, {
      passive: false,
    })

    dragCleanupRef.current = () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerEnd)
      document.removeEventListener('pointercancel', handlePointerCancel)
    }
  }

  const clearDrag = () => {
    dragSourceRef.current = ''
    dragTargetRef.current = ''
    setDraggedId('')
    setDragOverId('')
  }

  const toggleGroup = (rootId: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [rootId]: !current[rootId],
    }))
  }

  const renderOpenTask = (todo: TodoItem) => {
    const progress = progressRatio(todo.completedPomodoros, todo.requiredPomodoros)
    const isActive = todo.id === activeTaskId
    const hasStarted = todo.completedPomodoros > 0 || (isActive && isTimerRunning)
    const PriorityIcon = priorityIcons[todo.priority]
    const DifficultyIcon = difficultyIcons[todo.difficulty]
    const StatusIcon = hasStarted ? CirclePlay : CirclePause
    const timerButtonLabel = isActive
      ? isTimerRunning
        ? copy.pause
        : copy.resume
      : copy.start
    const isEditing = editingId === todo.id

    return (
      <div
        key={todo.id}
        data-todo-id={todo.id}
        className={`todo-row priority-${todo.priority}${
          isActive ? ' is-active' : ''
        }${draggedId === todo.id ? ' is-dragging' : ''}${
          dragOverId === todo.id ? ' is-drop-target' : ''
        }`}
      >
        <button
          className="check-button"
          type="button"
          aria-label={copy.toggle(todo.text)}
          onClick={() => onToggleTask(todo.id)}
        />

        <div className="todo-content">
          {isEditing ? (
            <form className="todo-edit-form" onSubmit={saveEdit}>
              <input
                value={editDraft.text}
                aria-label={copy.edit(todo.text)}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    text: event.target.value,
                  }))
                }
              />
              <div className="todo-edit-controls">
                <label className="todo-priority-select">
                  {(() => {
                    const Icon = priorityIcons[editDraft.priority]
                    return <Icon size={13} strokeWidth={1.9} />
                  })()}
                  <select
                    aria-label={copy.priorityAria}
                    value={editDraft.priority}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        priority: event.target.value as TodoPriority,
                      }))
                    }
                  >
                    {TODO_PRIORITIES.map((item) => (
                      <option key={item} value={item}>
                        {copy.priorities[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="todo-difficulty-select todo-attribute-select">
                  {(() => {
                    const Icon = difficultyIcons[editDraft.difficulty]
                    return <Icon size={13} strokeWidth={1.9} />
                  })()}
                  <select
                    aria-label={copy.difficultyAria}
                    value={editDraft.difficulty}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        difficulty: event.target.value as TodoDifficulty,
                      }))
                    }
                  >
                    {TODO_DIFFICULTIES.map((item) => (
                      <option key={item} value={item}>
                        {copy.difficulties[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="goal-stepper small" aria-label={copy.requiredPomodoros}>
                  <button
                    type="button"
                    aria-label={copy.decreaseRequired}
                    onClick={() => shiftEditGoal(-1)}
                  >
                    <Minus size={13} strokeWidth={1.9} />
                  </button>
                  <strong>{editDraft.requiredPomodoros}</strong>
                  <button
                    type="button"
                    aria-label={copy.increaseRequired}
                    onClick={() => shiftEditGoal(1)}
                  >
                    <Plus size={13} strokeWidth={1.9} />
                  </button>
                </div>
                <button className="quiet-icon" type="submit" aria-label={copy.save}>
                  <Save size={14} strokeWidth={1.9} />
                </button>
                <button
                  className="quiet-icon"
                  type="button"
                  aria-label={copy.cancel}
                  onClick={() => setEditingId('')}
                >
                  <X size={14} strokeWidth={1.9} />
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="todo-title-line">
                <span>{todo.text}</span>
                <AttributePill
                  className={`priority-pill priority-${todo.priority}`}
                  icon={PriorityIcon}
                  label={copy.priorities[todo.priority]}
                />
                <AttributePill
                  className={`difficulty-pill difficulty-${todo.difficulty}`}
                  icon={DifficultyIcon}
                  label={copy.difficulties[todo.difficulty]}
                />
                {todo.repeatIndex > 0 ? (
                  <small>{copy.repeatBadge(todo.repeatIndex)}</small>
                ) : null}
              </div>
              <div className={progressClass(progress)} aria-hidden="true">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <div className="todo-task-actions">
                <button
                  className={`active-task-button${isActive ? ' is-active' : ''}${
                    hasStarted ? ' is-started' : ' is-not-started'
                  }`}
                  type="button"
                  aria-label={copy.setActive(todo.text)}
                  onClick={() => onSetActive(todo.id)}
                >
                  {isActive && hasStarted ? (
                    <CircleDot size={13} strokeWidth={2} />
                  ) : (
                    <StatusIcon size={13} strokeWidth={1.9} />
                  )}
                  {hasStarted ? copy.inProgress : copy.notStarted}
                </button>
                <button
                  className={`task-timer-button${
                    isActive && isTimerRunning ? ' is-running' : ''
                  }`}
                  type="button"
                  aria-label={copy.timer(timerButtonLabel, todo.text)}
                  onClick={() => {
                    if (isActive && isTimerRunning) {
                      onPauseTaskTimer(todo.id)
                      return
                    }

                    onStartTaskTimer(todo.id)
                  }}
                >
                  {isActive && isTimerRunning ? (
                    <Pause size={12} strokeWidth={2} />
                  ) : (
                    <Play size={12} strokeWidth={2} />
                  )}
                  {timerButtonLabel}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="pomodoro-count" aria-label={copy.progressAria}>
          <strong>
            {todo.completedPomodoros}/{todo.requiredPomodoros}
          </strong>
        </div>

        <div className="todo-row-tools">
          <button
            className="quiet-icon drag-handle"
            type="button"
            aria-label={copy.drag(todo.text)}
            title={canDrag ? copy.drag(todo.text) : copy.manualOnly}
            disabled={!canDrag}
            onPointerDown={(event) => startPointerDrag(event, todo.id)}
            onPointerCancel={cancelPointerDrag}
          >
            <GripVertical size={15} strokeWidth={1.8} />
          </button>
          <button
            className="quiet-icon"
            type="button"
            aria-label={copy.edit(todo.text)}
            onClick={() => beginEdit(todo)}
          >
            <Edit3 size={14} strokeWidth={1.8} />
          </button>
          <button
            className="quiet-icon"
            type="button"
            aria-label={copy.delete(todo.text)}
            onClick={() => onDeleteTask(todo.id)}
          >
            <Trash2 size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    )
  }

  const renderCompletedGroup = (group: CompletedTodoGroup) => {
    const progress = progressRatio(
      group.totalCompletedPomodoros,
      group.totalRequiredPomodoros,
    )
    const expanded = Boolean(expandedGroups[group.rootId])
    const latestCompleted = formattedDate(group.latestCompletedAt)
    const hasOpenRepeat = openTodoRootIds.has(group.rootId)
    const PriorityIcon = priorityIcons[group.template.priority]
    const DifficultyIcon = difficultyIcons[group.template.difficulty]

    return (
      <div
        key={group.rootId}
        className={`todo-row todo-group-row priority-${group.template.priority} is-completed`}
      >
        <CompletedStack count={group.count} label={copy.stack(group.count)} />

        <div className="todo-content">
          <div className="todo-title-line">
            <span className="completed">{group.template.text}</span>
            <AttributePill
              className={`priority-pill priority-${group.template.priority}`}
              icon={PriorityIcon}
              label={copy.priorities[group.template.priority]}
            />
            <AttributePill
              className={`difficulty-pill difficulty-${group.template.difficulty}`}
              icon={DifficultyIcon}
              label={copy.difficulties[group.template.difficulty]}
            />
            <small>{copy.completedGroupCount(group.count)}</small>
            {hasOpenRepeat ? (
              <small className="todo-repeat-state">{copy.repeatPendingShort}</small>
            ) : null}
          </div>
          <div className={progressClass(progress)} aria-hidden="true">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="todo-group-meta">
            {latestCompleted ? (
              <span>{copy.latestCompleted(latestCompleted)}</span>
            ) : null}
            <span>
              {group.totalCompletedPomodoros}/{group.totalRequiredPomodoros}
            </span>
          </div>
          {expanded ? (
            <div className="todo-group-details" aria-label={copy.completedRuns}>
              {group.items.map((item) => {
                const completedAt = formattedDate(item.completedAt ?? item.updatedAt)
                const runLabel =
                  item.repeatIndex > 0
                    ? copy.repeatBadge(item.repeatIndex)
                    : copy.originalRun

                return (
                  <div key={item.id} className="todo-run-row">
                    <span>{runLabel}</span>
                    <small>{copy.runCompletedAt(completedAt)}</small>
                    <strong>
                      {item.completedPomodoros}/{item.requiredPomodoros}
                    </strong>
                    <button
                      className="quiet-icon"
                      type="button"
                      aria-label={copy.deleteCompletedRun(runLabel)}
                      onClick={() => onDeleteTask(item.id)}
                    >
                      <Trash2 size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>

        <div className="pomodoro-count" aria-label={copy.progressAria}>
          <strong>
            {group.totalCompletedPomodoros}/{group.totalRequiredPomodoros}
          </strong>
        </div>

        <div className="todo-row-tools is-compact">
          <button
            className="quiet-icon"
            type="button"
            aria-label={expanded ? copy.hideRuns : copy.showRuns}
            onClick={() => toggleGroup(group.rootId)}
          >
            {expanded ? (
              <ChevronDown size={15} strokeWidth={1.8} />
            ) : (
              <ChevronRight size={15} strokeWidth={1.8} />
            )}
          </button>
          <button
            className="quiet-icon"
            type="button"
            aria-label={
              hasOpenRepeat
                ? copy.repeatPending(group.template.text)
                : copy.repeat(group.template.text)
            }
            title={
              hasOpenRepeat
                ? copy.repeatPending(group.template.text)
                : copy.repeat(group.template.text)
            }
            disabled={hasOpenRepeat}
            onClick={() => onRepeatTask(group.rootId)}
          >
            <RotateCcw size={14} strokeWidth={1.9} />
          </button>
          <button
            className="quiet-icon"
            type="button"
            aria-label={copy.deleteCompletedGroup(group.template.text)}
            onClick={() => onDeleteTasks(group.items.map((item) => item.id))}
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="todo-widget">
      <div className="todo-window-bar">
        <label>
          <span>{copy.windowName}</span>
          <input
            value={titleDraft}
            aria-label={copy.renameWindow(windowTitle)}
            onBlur={saveWindowTitle}
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
          />
        </label>
        {canDeleteWindow ? (
          <button
            className="quiet-icon"
            type="button"
            aria-label={copy.deleteWindow(windowTitle)}
            onClick={onDeleteWindow}
          >
            <Trash2 size={15} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
      <form className="todo-form" onSubmit={addTodo}>
        <div className="todo-form-main">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={copy.addPlaceholder}
            aria-label={copy.addTask}
          />
          <button type="submit" aria-label={copy.addTask}>
            <Plus size={17} strokeWidth={1.9} />
          </button>
        </div>
        <div className="todo-form-options">
          <span>
            <Timer size={14} strokeWidth={1.8} />
            {copy.target}
          </span>
          <div className="goal-stepper" aria-label={copy.requiredPomodoros}>
            <button
              type="button"
              aria-label={copy.decreaseRequired}
              onClick={() => shiftGoal(-1)}
            >
              <Minus size={13} strokeWidth={1.9} />
            </button>
            <strong>{requiredPomodoros}</strong>
            <button
              type="button"
              aria-label={copy.increaseRequired}
              onClick={() => shiftGoal(1)}
            >
              <Plus size={13} strokeWidth={1.9} />
            </button>
          </div>
          <label className="todo-priority-select">
            {(() => {
              const Icon = priorityIcons[priority]
              return <Icon size={13} strokeWidth={1.9} />
            })()}
            <select
              aria-label={copy.priorityAria}
              value={priority}
              onChange={(event) => setPriority(event.target.value as TodoPriority)}
            >
              {TODO_PRIORITIES.map((item) => (
                <option key={item} value={item}>
                  {copy.priorities[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="todo-difficulty-select todo-attribute-select">
            {(() => {
              const Icon = difficultyIcons[difficulty]
              return <Icon size={13} strokeWidth={1.9} />
            })()}
            <select
              aria-label={copy.difficultyAria}
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as TodoDifficulty)}
            >
              {TODO_DIFFICULTIES.map((item) => (
                <option key={item} value={item}>
                  {copy.difficulties[item]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      <div className="todo-toolbar">
        <label className="todo-search">
          <Search size={14} strokeWidth={1.8} />
          <input
            value={query}
            aria-label={copy.search}
            placeholder={copy.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="todo-sort-select">
          <ListFilter size={14} strokeWidth={1.8} />
          <select
            aria-label={copy.sortAria}
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as TodoSortMode)}
          >
            {SORT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {copy.sortModes[mode]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="todo-tabs" aria-label={copy.filterAria}>
        {FILTERS.map((item) => (
          <button
            key={item}
            className={filter === item ? 'is-selected' : ''}
            type="button"
            onClick={() => setFilter(item)}
          >
            {copy.filters[item]}
          </button>
        ))}
      </div>

      <div className="todo-summary">
        {copy.counts(counts.active, counts.completed)}
      </div>

      <div className="todo-list">
        {visibleAllEntries.map((entry) =>
          entry.kind === 'open'
            ? renderOpenTask(entry.todo)
            : renderCompletedGroup(entry.group),
        )}
        {visibleActiveTodos.map(renderOpenTask)}
        {visibleCompletedGroups.map(renderCompletedGroup)}
        {!visibleAllEntries.length &&
        !visibleActiveTodos.length &&
        !visibleCompletedGroups.length ? (
          <div className="todo-empty">
            <Check size={18} strokeWidth={1.8} />
            <span>{copy.noTasks}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
