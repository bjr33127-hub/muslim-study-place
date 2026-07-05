import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  Image,
  Plus,
  Timer,
  Users,
  Video,
} from 'lucide-react'
import type { ElementType } from 'react'
import { WIDGET_ORDER } from '../../lib/defaults'
import type { TaskWindow, WidgetId, WidgetLayout } from '../../types/app'

const dockIcons: Record<WidgetId, ElementType> = {
  pomodoro: Timer,
  todo: CheckSquare,
  revisionDashboard: BarChart3,
  friends: Users,
  youtube: Video,
  backgrounds: Image,
}

export type DockBadge = {
  count: number
  label?: string
}

type DockProps = {
  labels: Record<WidgetId, string>
  taskWindows: TaskWindow[]
  label: string
  layouts: Record<WidgetId, WidgetLayout>
  taskWindowLayouts: Record<string, WidgetLayout>
  badges?: {
    revisionDashboard?: DockBadge
    friends?: DockBadge
    taskWindows?: Record<string, DockBadge>
  }
  addTaskWindowLabel: string
  revisionPlannerLabel: string
  revisionPlannerOpen: boolean
  friendsPageLabel: string
  friendsPageOpen: boolean
  onToggle: (id: WidgetId) => void
  onToggleTaskWindow: (id: string) => void
  onAddTaskWindow: () => void
  onOpenRevisionPlanner: () => void
  onOpenFriendsPage: () => void
}

export function Dock({
  labels,
  taskWindows,
  label,
  layouts,
  taskWindowLayouts,
  badges,
  addTaskWindowLabel,
  revisionPlannerLabel,
  revisionPlannerOpen,
  friendsPageLabel,
  friendsPageOpen,
  onToggle,
  onToggleTaskWindow,
  onAddTaskWindow,
  onOpenRevisionPlanner,
  onOpenFriendsPage,
}: DockProps) {
  const revisionBadge = badges?.revisionDashboard
  const friendsBadge = badges?.friends
  const friendsAriaLabel =
    friendsBadge?.count && friendsBadge.count > 0
      ? `${friendsPageLabel} - ${friendsBadge.label ?? friendsBadge.count}`
      : friendsPageLabel
  const renderBadge = (badge?: DockBadge) =>
    badge?.count ? (
      <span className="dock-badge" aria-hidden="true">
        {badge.count > 9 ? '9+' : badge.count}
      </span>
    ) : null

  return (
    <nav className="dock" aria-label={label}>
      <button
        className={`dock-button dock-revision-planner-button${revisionPlannerOpen ? ' is-active' : ''}`}
        type="button"
        aria-pressed={revisionPlannerOpen}
        aria-label={revisionPlannerLabel}
        title={revisionPlannerLabel}
        onClick={onOpenRevisionPlanner}
      >
        <CalendarDays size={20} strokeWidth={1.8} />
        <span className="dock-label">{revisionPlannerLabel}</span>
      </button>
      {WIDGET_ORDER.map((id) => {
        if (id === 'todo') {
          return (
            <span className="dock-task-group" key={id}>
              {taskWindows.map((window) => {
                const visible = Boolean(taskWindowLayouts[window.id]?.visible)
                const taskBadge = badges?.taskWindows?.[window.id]
                const taskAriaLabel =
                  taskBadge?.count && taskBadge.count > 0
                    ? `${window.title} - ${taskBadge.label ?? taskBadge.count}`
                    : window.title
                const windowMark =
                  window.emoji?.trim() ||
                  window.title.slice(0, 2).toLocaleUpperCase()

                return (
                  <button
                    key={window.id}
                    className={`dock-button dock-task-button${visible ? ' is-active' : ''}`}
                    type="button"
                    aria-pressed={visible}
                    aria-label={taskAriaLabel}
                    title={taskAriaLabel}
                    onClick={() => onToggleTaskWindow(window.id)}
                  >
                    <CheckSquare size={20} strokeWidth={1.8} />
                    <span className="dock-label">{window.title}</span>
                    <span className="dock-abbrev">{windowMark}</span>
                    {renderBadge(taskBadge)}
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
                <span className="dock-label">{addTaskWindowLabel}</span>
              </button>
            </span>
          )
        }

        if (id === 'friends') {
          const Icon = dockIcons[id]

          return (
            <button
              key={id}
              className={`dock-button dock-widget-button dock-widget-${id}${friendsPageOpen ? ' is-active' : ''}`}
              type="button"
              aria-pressed={friendsPageOpen}
              aria-label={friendsAriaLabel}
              title={friendsAriaLabel}
              onClick={onOpenFriendsPage}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span className="dock-label">{friendsPageLabel}</span>
              {renderBadge(friendsBadge)}
            </button>
          )
        }

        const Icon = dockIcons[id]
        const visible = layouts[id].visible
        const widgetLabel = labels[id]
        const widgetBadge = id === 'revisionDashboard' ? revisionBadge : undefined
        const widgetAriaLabel =
          widgetBadge?.count && widgetBadge.count > 0
            ? `${widgetLabel} - ${widgetBadge.label ?? widgetBadge.count}`
            : widgetLabel

        return (
          <button
            key={id}
            className={`dock-button dock-widget-button dock-widget-${id}${visible ? ' is-active' : ''}`}
            type="button"
            aria-pressed={visible}
            aria-label={widgetAriaLabel}
            title={widgetAriaLabel}
            onClick={() => onToggle(id)}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span className="dock-label">{widgetLabel}</span>
            {renderBadge(widgetBadge)}
          </button>
        )
      })}
    </nav>
  )
}
