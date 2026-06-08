import { GripHorizontal, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { WidgetLayout } from '../../types/app'

type Interaction = {
  mode: 'drag' | 'resize'
  startX: number
  startY: number
  layout: WidgetLayout
}

type WidgetFrameProps = {
  title: string
  icon: ReactNode
  layout: WidgetLayout
  children: ReactNode
  onLayoutChange: (layout: WidgetLayout) => void
  onClose: () => void
  onFocus: () => void
  bare?: boolean
}

export function WidgetFrame({
  title,
  icon,
  layout,
  children,
  onLayoutChange,
  onClose,
  onFocus,
  bare = false,
}: WidgetFrameProps) {
  const interactionRef = useRef<Interaction | null>(null)

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const interaction = interactionRef.current

      if (!interaction) {
        return
      }

      const deltaX = event.clientX - interaction.startX
      const deltaY = event.clientY - interaction.startY

      if (interaction.mode === 'drag') {
        const maxX = Math.max(88, window.innerWidth - interaction.layout.width - 18)
        const maxY = Math.max(18, window.innerHeight - interaction.layout.height - 18)
        onLayoutChange({
          ...interaction.layout,
          x: Math.min(Math.max(88, interaction.layout.x + deltaX), maxX),
          y: Math.min(Math.max(18, interaction.layout.y + deltaY), maxY),
        })
        return
      }

      const maxWidth = Math.max(300, window.innerWidth - interaction.layout.x - 18)
      const maxHeight = Math.max(220, window.innerHeight - interaction.layout.y - 18)
      onLayoutChange({
        ...interaction.layout,
        width: Math.min(Math.max(300, interaction.layout.width + deltaX), maxWidth),
        height: Math.min(Math.max(220, interaction.layout.height + deltaY), maxHeight),
      })
    }

    const stopInteraction = () => {
      interactionRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopInteraction)
    window.addEventListener('pointercancel', stopInteraction)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopInteraction)
      window.removeEventListener('pointercancel', stopInteraction)
    }
  }, [onLayoutChange])

  const startInteraction = (
    event: ReactPointerEvent,
    mode: Interaction['mode'],
  ) => {
    if (window.matchMedia('(max-width: 859px)').matches) {
      return
    }

    event.preventDefault()
    onFocus()
    interactionRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      layout,
    }
  }

  if (!layout.visible) {
    return null
  }

  return (
    <section
      className={`widget-frame widget-frame-${layout.id}${bare ? ' is-bare' : ''}`}
      style={{
        left: layout.x,
        top: layout.y,
        width: layout.width,
        height: layout.height,
        zIndex: layout.z,
      }}
      onPointerDown={onFocus}
      aria-label={title}
    >
      {bare ? (
        <div
          className="bare-widget-controls"
          onPointerDown={(event) => startInteraction(event, 'drag')}
        >
          <GripHorizontal size={17} strokeWidth={1.8} />
          <button
            className="icon-button close-button"
            type="button"
            aria-label={`Hide ${title}`}
            onClick={onClose}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
      ) : (
        <div
          className="widget-header"
          onPointerDown={(event) => startInteraction(event, 'drag')}
        >
          <div className="widget-title">
            <span className="widget-icon" aria-hidden="true">
              {icon}
            </span>
            <span>{title}</span>
          </div>
          <button
            className="icon-button close-button"
            type="button"
            aria-label={`Hide ${title}`}
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
      )}
      <div className="widget-body">{children}</div>
      <button
        className="resize-handle"
        type="button"
        aria-label={`Resize ${title}`}
        onPointerDown={(event) => startInteraction(event, 'resize')}
      />
    </section>
  )
}
