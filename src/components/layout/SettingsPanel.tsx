import { RotateCcw, X } from 'lucide-react'
import { WIDGET_LABELS, WIDGET_ORDER } from '../../lib/defaults'
import type {
  StreakState,
  TimerSettings,
  WidgetId,
  WidgetLayout,
} from '../../types/app'

type SettingsPanelProps = {
  isOpen: boolean
  layouts: Record<WidgetId, WidgetLayout>
  streak: StreakState
  timerSettings: TimerSettings
  backgroundDim: number
  onClose: () => void
  onResetLayout: () => void
  onToggleWidget: (id: WidgetId) => void
  onDailyGoalChange: (value: number) => void
  onTimerSettingChange: (key: keyof TimerSettings, value: number) => void
  onBackgroundDimChange: (value: number) => void
}

export function SettingsPanel({
  isOpen,
  layouts,
  streak,
  timerSettings,
  backgroundDim,
  onClose,
  onResetLayout,
  onToggleWidget,
  onDailyGoalChange,
  onTimerSettingChange,
  onBackgroundDimChange,
}: SettingsPanelProps) {
  if (!isOpen) {
    return null
  }

  return (
    <aside className="settings-panel" aria-label="Settings">
      <div className="settings-header">
        <div>
          <h2>Settings</h2>
          <p>Adjust the study place.</p>
        </div>
        <button
          className="icon-button close-button"
          type="button"
          aria-label="Close settings"
          onClick={onClose}
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>

      <section className="settings-section">
        <h3>Widgets</h3>
        <div className="settings-list">
          {WIDGET_ORDER.map((id) => (
            <label key={id} className="settings-toggle">
              <span>{WIDGET_LABELS[id]}</span>
              <input
                type="checkbox"
                checked={layouts[id].visible}
                onChange={() => onToggleWidget(id)}
              />
            </label>
          ))}
        </div>
        <button className="ghost-action full-width" type="button" onClick={onResetLayout}>
          <RotateCcw size={16} strokeWidth={1.8} />
          Reset layout
        </button>
      </section>

      <section className="settings-section">
        <h3>Pomodoro</h3>
        <label className="settings-field">
          <span>Focus minutes</span>
          <input
            aria-label="Focus minutes"
            type="number"
            min="1"
            max="180"
            value={timerSettings.focusMinutes}
            onChange={(event) =>
              onTimerSettingChange('focusMinutes', Number(event.target.value))
            }
          />
        </label>
        <label className="settings-field">
          <span>Short break minutes</span>
          <input
            aria-label="Short break minutes"
            type="number"
            min="1"
            max="60"
            value={timerSettings.shortBreakMinutes}
            onChange={(event) =>
              onTimerSettingChange('shortBreakMinutes', Number(event.target.value))
            }
          />
        </label>
        <label className="settings-field">
          <span>Long break minutes</span>
          <input
            aria-label="Long break minutes"
            type="number"
            min="1"
            max="90"
            value={timerSettings.longBreakMinutes}
            onChange={(event) =>
              onTimerSettingChange('longBreakMinutes', Number(event.target.value))
            }
          />
        </label>
        <label className="settings-field">
          <span>Long break every</span>
          <input
            aria-label="Long break every"
            type="number"
            min="1"
            max="12"
            value={timerSettings.longBreakEvery}
            onChange={(event) =>
              onTimerSettingChange('longBreakEvery', Number(event.target.value))
            }
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>Focus flame</h3>
        <label className="settings-field">
          <span>Daily flame target</span>
          <input
            type="number"
            min="1"
            max="12"
            value={streak.dailyGoal}
            onChange={(event) => onDailyGoalChange(Number(event.target.value))}
          />
        </label>
        <div className="streak-stats">
          <span>Current {streak.current}</span>
          <span>Best {streak.best}</span>
          <span>Today {streak.todayCount}</span>
        </div>
      </section>

      <section className="settings-section">
        <h3>Background</h3>
        <label className="settings-field">
          <span>Dim background</span>
          <input
            type="range"
            min="45"
            max="100"
            value={backgroundDim}
            onChange={(event) => onBackgroundDimChange(Number(event.target.value))}
          />
        </label>
      </section>

      <section className="settings-section credit-section">
        <h3>Credit</h3>
        <p>
          Thanks to Melkeydev, creator of Astrostation, for the inspiration and
          the beautiful train background.
        </p>
        <a href="https://github.com/Melkeydev/astrostation" target="_blank" rel="noreferrer">
          Astrostation on GitHub
        </a>
      </section>
    </aside>
  )
}
