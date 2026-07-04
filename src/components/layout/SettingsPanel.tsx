import {
  BookOpen,
  Download,
  Flame,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { WIDGET_ORDER } from '../../lib/defaults'
import { LANGUAGES } from '../../lib/i18n'
import type { AppCopy } from '../../lib/i18n'
import type {
  AppLanguage,
  FlameEvolutionState,
  FlameUnlockKey,
  MemoryStatus,
  StreakState,
  TaskWindow,
  TimerSettings,
  WidgetId,
  WidgetLayout,
} from '../../types/app'
import { AchievementCodex } from './AchievementCodex'

type SettingsPanelProps = {
  copy: AppCopy['settings']
  streakCopy: AppCopy['streak']
  isOpen: boolean
  language: AppLanguage
  widgetLabels: Record<WidgetId, string>
  layouts: Record<WidgetId, WidgetLayout>
  taskWindows: TaskWindow[]
  taskWindowLayouts: Record<string, WidgetLayout>
  streak: StreakState
  flameEvolution: FlameEvolutionState
  timerSettings: TimerSettings
  memoryStatus: MemoryStatus
  memoryNotice: string
  backgroundDim: number
  particlesEnabled: boolean
  onClose: () => void
  onLanguageChange: (language: AppLanguage) => void
  onResetLayout: () => void
  onToggleWidget: (id: WidgetId) => void
  onToggleTaskWindow: (id: string) => void
  onDailyGoalChange: (value: number) => void
  onAddStreakDay: () => void
  onRevealFlameHint: (key: FlameUnlockKey) => void
  onTimerSettingChange: (key: keyof TimerSettings, value: number) => void
  onBackgroundDimChange: (value: number) => void
  onParticlesEnabledChange: (value: boolean) => void
  onExportData: () => void
  onImportData: (file: File | null) => void
}

export function SettingsPanel({
  copy,
  streakCopy,
  isOpen,
  language,
  widgetLabels,
  layouts,
  taskWindows,
  taskWindowLayouts,
  streak,
  flameEvolution,
  timerSettings,
  memoryStatus,
  memoryNotice,
  backgroundDim,
  particlesEnabled,
  onClose,
  onLanguageChange,
  onResetLayout,
  onToggleWidget,
  onToggleTaskWindow,
  onDailyGoalChange,
  onAddStreakDay,
  onRevealFlameHint,
  onTimerSettingChange,
  onBackgroundDimChange,
  onParticlesEnabledChange,
  onExportData,
  onImportData,
}: SettingsPanelProps) {
  const [codexOpen, setCodexOpen] = useState(false)

  if (!isOpen) {
    return null
  }

  const memoryUpdated = memoryStatus.updatedAt
    ? new Date(memoryStatus.updatedAt).toLocaleString(language)
    : ''

  return (
    <aside className="settings-panel" aria-label={copy.title}>
      <div className="settings-header">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
        <button
          className="icon-button close-button"
          type="button"
          aria-label={copy.close}
          onClick={onClose}
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>

      <section className="settings-section">
        <h3>{copy.language}</h3>
        <label className="settings-field">
          <span>{copy.interfaceLanguage}</span>
          <select
            aria-label={copy.interfaceLanguage}
            value={language}
            onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}
          >
            {LANGUAGES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="settings-section">
        <h3>{copy.widgets}</h3>
        <div className="settings-list">
          {WIDGET_ORDER.filter((id) => id !== 'todo').map((id) => (
            <label key={id} className="settings-toggle">
              <span>{widgetLabels[id]}</span>
              <input
                type="checkbox"
                checked={layouts[id].visible}
                onChange={() => onToggleWidget(id)}
              />
            </label>
          ))}
          {taskWindows.map((window) => (
            <label key={window.id} className="settings-toggle">
              <span>{window.title}</span>
              <input
                type="checkbox"
                checked={Boolean(taskWindowLayouts[window.id]?.visible)}
                onChange={() => onToggleTaskWindow(window.id)}
              />
            </label>
          ))}
        </div>
        <button className="ghost-action full-width" type="button" onClick={onResetLayout}>
          <RotateCcw size={16} strokeWidth={1.8} />
          {copy.resetLayout}
        </button>
      </section>

      <section className="settings-section">
        <h3>{copy.pomodoro}</h3>
        <label className="settings-field">
          <span>{copy.focusMinutes}</span>
          <input
            aria-label={copy.focusMinutes}
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
          <span>{copy.shortBreakMinutes}</span>
          <input
            aria-label={copy.shortBreakMinutes}
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
          <span>{copy.longBreakMinutes}</span>
          <input
            aria-label={copy.longBreakMinutes}
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
          <span>{copy.longBreakEvery}</span>
          <input
            aria-label={copy.longBreakEvery}
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
        <h3>{copy.focusFlame}</h3>
        <label className="settings-field">
          <span>{copy.dailyFlameTarget}</span>
          <input
            aria-label={copy.dailyFlameTarget}
            type="number"
            min="1"
            max="12"
            value={streak.dailyGoal}
            onChange={(event) => onDailyGoalChange(Number(event.target.value))}
          />
        </label>
        <div className="streak-stats">
          <span>{copy.current} {streak.current}</span>
          <span>{copy.best} {streak.best}</span>
          <span>{copy.today} {streak.todayCount}</span>
        </div>
        <button
          className="ghost-action full-width"
          type="button"
          hidden
          onClick={onAddStreakDay}
        >
          <Flame size={15} strokeWidth={1.8} />
          {copy.addStreakDay}
        </button>
        <div className="flame-settings-tools">
          <button
            className="settings-feature-action"
            type="button"
            onClick={() => setCodexOpen(true)}
          >
            <BookOpen size={18} strokeWidth={1.7} />
            <span>
              <strong>{copy.achievementCodex}</strong>
              <small>{copy.achievementCodexHint}</small>
            </span>
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>{copy.memory}</h3>
        <div
          className={`memory-status${memoryStatus.available ? ' is-ready' : ' is-offline'}`}
        >
          <strong>
            {memoryStatus.available ? copy.memoryReady : copy.memoryUnavailable}
          </strong>
          <span>{copy.memoryKeys(memoryStatus.keyCount)}</span>
          <small>
            {memoryUpdated ? copy.memoryUpdated(memoryUpdated) : copy.memoryNever}
          </small>
        </div>
        <div className="settings-actions-row">
          <button className="ghost-action" type="button" onClick={onExportData}>
            <Download size={15} strokeWidth={1.8} />
            {copy.exportData}
          </button>
          <label className="ghost-action import-action">
            <Upload size={15} strokeWidth={1.8} />
            {copy.importData}
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                onImportData(event.target.files?.[0] ?? null)
                event.currentTarget.value = ''
              }}
            />
          </label>
        </div>
        <p className={memoryNotice ? 'form-error' : 'settings-hint'}>
          {memoryNotice || copy.importHint}
        </p>
      </section>

      <section className="settings-section">
        <h3>{copy.background}</h3>
        <label className="settings-field">
          <span>{copy.dimBackground}</span>
          <input
            type="range"
            min="45"
            max="100"
            value={backgroundDim}
            onChange={(event) => onBackgroundDimChange(Number(event.target.value))}
          />
        </label>
        <label className="settings-toggle">
          <span>{copy.magicParticles}</span>
          <input
            aria-label={copy.magicParticles}
            type="checkbox"
            checked={particlesEnabled}
            onChange={(event) => onParticlesEnabledChange(event.target.checked)}
          />
        </label>
      </section>

      <section className="settings-section credit-section">
        <h3>{copy.credit}</h3>
        <p>{copy.creditCopy}</p>
        <a href="https://github.com/Melkeydev/astrostation" target="_blank" rel="noreferrer">
          {copy.creditLink}
        </a>
      </section>

      {codexOpen
        ? createPortal(
            <AchievementCodex
              copy={streakCopy}
              evolution={flameEvolution}
              onClose={() => setCodexOpen(false)}
              onRevealHint={onRevealFlameHint}
            />,
            document.body,
          )
        : null}
    </aside>
  )
}
