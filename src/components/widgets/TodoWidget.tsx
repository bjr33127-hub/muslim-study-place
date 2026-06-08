import {
  Check,
  CircleDot,
  Minus,
  Pause,
  Play,
  Plus,
  Target,
  Timer,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { clampPomodoros } from '../../lib/todos'
import type { TodoItem } from '../../types/app'

type TodoWidgetProps = {
  todos: TodoItem[]
  activeTaskId?: string
  isTimerRunning: boolean
  onAddTask: (text: string, requiredPomodoros: number) => void
  onToggleTask: (id: string) => void
  onDeleteTask: (id: string) => void
  onSetActive: (id: string) => void
  onStartTaskTimer: (id: string) => void
  onPauseTaskTimer: (id: string) => void
}

export function TodoWidget({
  todos,
  activeTaskId,
  isTimerRunning,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onSetActive,
  onStartTaskTimer,
  onPauseTaskTimer,
}: TodoWidgetProps) {
  const [draft, setDraft] = useState('')
  const [requiredPomodoros, setRequiredPomodoros] = useState(1)

  const addTodo = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()

    if (!text) {
      return
    }

    onAddTask(text, requiredPomodoros)
    setDraft('')
  }

  const shiftGoal = (delta: number) => {
    setRequiredPomodoros((current) => clampPomodoros(current + delta))
  }

  return (
    <div className="todo-widget">
      <form className="todo-form" onSubmit={addTodo}>
        <div className="todo-form-main">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add task"
            aria-label="Add task"
          />
          <button type="submit" aria-label="Add task">
            <Plus size={17} strokeWidth={1.9} />
          </button>
        </div>
        <div className="todo-form-options">
          <span>
            <Timer size={14} strokeWidth={1.8} />
            Target
          </span>
          <div className="goal-stepper" aria-label="Required pomodoros">
            <button
              type="button"
              aria-label="Decrease required pomodoros"
              onClick={() => shiftGoal(-1)}
            >
              <Minus size={13} strokeWidth={1.9} />
            </button>
            <strong>{requiredPomodoros}</strong>
            <button
              type="button"
              aria-label="Increase required pomodoros"
              onClick={() => shiftGoal(1)}
            >
              <Plus size={13} strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </form>

      <div className="todo-list">
        {todos.map((todo) => {
          const progress = todo.completedPomodoros / todo.requiredPomodoros
          const isActive = todo.id === activeTaskId
          const timerButtonLabel = isActive
            ? isTimerRunning
              ? 'Pause'
              : 'Resume'
            : 'Start'

          return (
            <div
              key={todo.id}
              className={`todo-row${isActive ? ' is-active' : ''}`}
            >
              <button
                className={`check-button${todo.completed ? ' is-complete' : ''}`}
                type="button"
                aria-label={`Toggle ${todo.text}`}
                onClick={() => onToggleTask(todo.id)}
              >
                {todo.completed ? <Check size={14} strokeWidth={2.1} /> : null}
              </button>

              <div className="todo-content">
                <span className={todo.completed ? 'completed' : ''}>{todo.text}</span>
                <div
                  className={`pomodoro-progress${
                    progress > 0 ? ' has-progress' : ' is-empty'
                  }${progress >= 1 ? ' is-complete' : ''}`}
                  aria-hidden="true"
                >
                  <span style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <div className="todo-task-actions">
                  <button
                    className={`active-task-button${isActive ? ' is-active' : ''}`}
                    type="button"
                    aria-label={`Set ${todo.text} active`}
                    disabled={todo.completed}
                    onClick={() => onSetActive(todo.id)}
                  >
                    {isActive ? (
                      <CircleDot size={13} strokeWidth={2} />
                    ) : (
                      <Target size={13} strokeWidth={1.8} />
                    )}
                    {isActive ? 'Active' : 'Waiting'}
                  </button>
                  <button
                    className={`task-timer-button${
                      isActive && isTimerRunning ? ' is-running' : ''
                    }`}
                    type="button"
                    aria-label={`${timerButtonLabel} ${todo.text} timer`}
                    disabled={todo.completed}
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
              </div>

              <div className="pomodoro-count" aria-label="Pomodoro progress">
                <strong>
                  {todo.completedPomodoros}/{todo.requiredPomodoros}
                </strong>
              </div>

              <button
                className="quiet-icon"
                type="button"
                aria-label={`Delete ${todo.text}`}
                onClick={() => onDeleteTask(todo.id)}
              >
                <Trash2 size={15} strokeWidth={1.8} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
