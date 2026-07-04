import { CheckSquare, Image, Plus, Timer, Video } from 'lucide-react'
import type { ElementType } from 'react'
import { WIDGET_ORDER } from '../../lib/defaults'
import type { TaskWindow, WidgetId, WidgetLayout } from '../../types/app'

const dockIcons: Record<WidgetId, ElementType> = {
  pomodoro: Timer,
  todo: CheckSquare,
  youtube: Video,
  backgrounds: Image,
}

type DockProps = {
  labels: Record<WidgetId, string>
  taskWindows: TaskWindow[]
  label: string
  layouts: Record<WidgetId, WidgetLayout>
  taskWindowLayouts: Record<string, WidgetLayout>
  addTaskWindowLabel: string
  onToggle: (id: WidgetId) => void
  onFocus: (id: WidgetId) => void
  onToggleTaskWindow: (id: string) => void
  onFocusTaskWindow: (id: string) => void
  onAddTaskWindow: () => void
}

export function Dock({
  labels,
  taskWindows,
  label,
  layouts,
  taskWindowLayouts,
  addTaskWindowLabel,
  onToggle,
  onFocus,
  onToggleTaskWindow,
  onFocusTaskWindow,
  onAddTaskWindow,
}: DockProps) {
  return (
    <nav className="dock" aria-label={label}>
      {WIDGET_ORDER.map((id) => {
        if (id === 'todo') {
          return (
            <span className="dock-task-group" key={id}>
              {taskWindows.map((window) => {
                const visible = Boolean(taskWindowLayouts[window.id]?.visible)

                return (
                  <button
                    key={window.id}
                    className={`dock-button dock-task-button${visible ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={visible}
                    aria-label={window.title}
                    title={window.title}
                    onClick={() => {
                      onToggleTaskWindow(window.id)
                      onFocusTaskWindow(window.id)
                    }}
                  >
                    <CheckSquare size={20} strokeWidth={1.8} />
                    <span>{window.title.slice(0, 2).toLocaleUpperCase()}</span>
                  </button>
                )
              })}
              <button
                className="dock-button dock-add-task-window"
                type="button"
                aria-label={addTaskWindowLabel}
                title={addTaskWindowLabel}
                onClick={onAddTaskWindow}
              >
                <Plus size={18} strokeWidth={2} />
              </button>
            </span>
          )
        }

        const Icon = dockIcons[id]
        const visible = layouts[id].visible
        const widgetLabel = labels[id]

        return (
          <button
            key={id}
            className={`dock-button${visible ? ' is-active' : ''}`}
            type="button"
            aria-pressed={visible}
            aria-label={widgetLabel}
            title={widgetLabel}
            onClick={() => {
              onToggle(id)
              onFocus(id)
            }}
          >
            <Icon size={20} strokeWidth={1.8} />
          </button>
        )
      })}
    </nav>
  )
}
