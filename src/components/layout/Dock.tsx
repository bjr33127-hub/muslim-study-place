import { CheckSquare, Image, Timer, Video } from 'lucide-react'
import type { ElementType } from 'react'
import { WIDGET_ORDER } from '../../lib/defaults'
import type { WidgetId, WidgetLayout } from '../../types/app'

const dockIcons: Record<WidgetId, ElementType> = {
  pomodoro: Timer,
  todo: CheckSquare,
  youtube: Video,
  backgrounds: Image,
}

type DockProps = {
  labels: Record<WidgetId, string>
  label: string
  layouts: Record<WidgetId, WidgetLayout>
  onToggle: (id: WidgetId) => void
  onFocus: (id: WidgetId) => void
}

export function Dock({ labels, label, layouts, onToggle, onFocus }: DockProps) {
  return (
    <nav className="dock" aria-label={label}>
      {WIDGET_ORDER.map((id) => {
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
