import {
  BookOpen,
  CheckSquare,
  Image,
  Timer,
  Video,
} from 'lucide-react'
import type { ElementType } from 'react'
import { WIDGET_LABELS, WIDGET_ORDER } from '../../lib/defaults'
import type { WidgetId, WidgetLayout } from '../../types/app'

const dockIcons: Record<WidgetId, ElementType> = {
  pomodoro: Timer,
  todo: CheckSquare,
  spotify: BookOpen,
  youtube: Video,
  backgrounds: Image,
}

type DockProps = {
  layouts: Record<WidgetId, WidgetLayout>
  onToggle: (id: WidgetId) => void
  onFocus: (id: WidgetId) => void
}

export function Dock({ layouts, onToggle, onFocus }: DockProps) {
  return (
    <nav className="dock" aria-label="Widgets">
      {WIDGET_ORDER.map((id) => {
        const Icon = dockIcons[id]
        const visible = layouts[id].visible

        return (
          <button
            key={id}
            className={`dock-button${visible ? ' is-active' : ''}`}
            type="button"
            aria-pressed={visible}
            aria-label={WIDGET_LABELS[id]}
            title={WIDGET_LABELS[id]}
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
