import { Activity, Sparkles, Star, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AppCopy } from '../../lib/i18n'
import { getPomodoroWeekSummary } from '../../lib/pomodoroRun'
import type { PomodoroRunState } from '../../types/app'

type MetricCopy = AppCopy['topbar']

type WeeklyMomentumBadgeProps = {
  run: PomodoroRunState
  copy: MetricCopy
  burstKey: number
  isOpen: boolean
  onToggleOpen: () => void
  onClose: () => void
}

type TotalStarsBadgeProps = {
  run: PomodoroRunState
  copy: MetricCopy
  showerKey: number
  isOpen: boolean
  onToggleOpen: () => void
  onClose: () => void
}

function useTimedPulse(key: number, duration = 1500) {
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    if (!key) {
      return
    }

    let frame = 0
    const restart = window.setTimeout(() => {
      setIsActive(false)
      frame = window.requestAnimationFrame(() => setIsActive(true))
    }, 0)
    const timeout = window.setTimeout(() => setIsActive(false), duration)

    return () => {
      window.clearTimeout(restart)
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [duration, key])

  return isActive
}

function MetricWeekRow({
  days,
  weekdays,
  variant,
}: {
  days: ReturnType<typeof getPomodoroWeekSummary>['days']
  weekdays: readonly string[]
  variant: 'combo' | 'stars'
}) {
  return (
    <div className={`metric-week-row is-${variant}`}>
      {days.map((day, index) => (
        <span
          key={day.date}
          className={[
            'metric-day',
            day.stars > 0 ? 'is-lit' : '',
            day.isToday ? 'is-today' : '',
            day.isFuture ? 'is-future' : '',
          ].filter(Boolean).join(' ')}
          title={`${weekdays[index]} ${day.date}`}
        >
          <i />
          <small>{weekdays[index]}</small>
        </span>
      ))}
    </div>
  )
}

export function WeeklyMomentumBadge({
  run,
  copy,
  burstKey,
  isOpen,
  onToggleOpen,
  onClose,
}: WeeklyMomentumBadgeProps) {
  const isBursting = useTimedPulse(burstKey, 1300)
  const week = useMemo(() => getPomodoroWeekSummary(run), [run])
  const isLit = week.weekStars > 0

  return (
    <div className={`metric-shell best-run-shell${isOpen ? ' is-open' : ''}`}>
      <button
        className={[
          'best-run-star',
          isLit ? 'is-lit' : '',
          isBursting ? 'is-bursting' : '',
        ].filter(Boolean).join(' ')}
        type="button"
        aria-label={copy.weeklyMomentumOpen}
        aria-expanded={isOpen}
        onClick={onToggleOpen}
      >
        <span className="best-star-orb" aria-hidden="true">
          <span className="combo-ring" />
          <Activity size={18} strokeWidth={2} />
        </span>
        <span className="best-run-copy">
          <strong>{week.weekStars}</strong>
          <span>{copy.weeklyMomentum}</span>
        </span>
        <span className="combo-mini" aria-hidden="true">
          {week.days.map((day) => (
            <i key={day.date} className={day.stars > 0 ? 'is-filled' : ''} />
          ))}
        </span>
      </button>

      {isOpen ? (
        <div className="pomodoro-metric-popover best-run-popover" role="dialog" aria-label={copy.weeklyMomentumPanelTitle}>
          <div className="metric-popover-head">
            <span className="metric-hero-orb combo-hero" aria-hidden="true">
              <span className="combo-ring" />
              <Activity size={42} strokeWidth={1.9} />
              <Zap size={22} strokeWidth={2.1} />
            </span>
            <button
              className="quiet-icon metric-close"
              type="button"
              aria-label={copy.closeWeeklyMomentumPanel}
              onClick={onClose}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="metric-hero-copy">
            <strong>{week.weekStars}</strong>
            <span>{copy.weeklyMomentumPanelTitle}</span>
          </div>
          <div className="combo-progress-panel">
            <div>
              <span>{copy.weeklyRhythm}</span>
              <strong>{copy.activeDays(week.activeDays)}</strong>
            </div>
            <div className="combo-segment-row" aria-hidden="true">
              {week.days.map((day) => (
                <i key={day.date} className={day.stars > 0 ? 'is-filled' : ''} />
              ))}
            </div>
          </div>
          <div className="metric-week-head">
            <span>{copy.weekTitle}</span>
            <strong>{copy.weekStars(week.weekStars)}</strong>
          </div>
          <MetricWeekRow days={week.days} weekdays={copy.weekdays} variant="combo" />
          <div className="metric-panel-stats">
            <span>
              <small>{copy.todayStars}</small>
              <strong>{week.todayStars}</strong>
            </span>
            <span>
              <small>{copy.activeStarDays}</small>
              <strong>{week.activeDays}/7</strong>
            </span>
            <span>
              <small>{copy.weekTotal}</small>
              <strong>{week.weekStars}</strong>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function TotalStarsBadge({
  run,
  copy,
  showerKey,
  isOpen,
  onToggleOpen,
  onClose,
}: TotalStarsBadgeProps) {
  const isShowering = useTimedPulse(showerKey, 1600)
  const week = useMemo(() => getPomodoroWeekSummary(run), [run])
  const isLit = run.totalStars > 0

  return (
    <div className={`metric-shell total-stars-shell${isOpen ? ' is-open' : ''}`}>
      <button
        className={[
          'total-stars-counter',
          isLit ? 'is-lit' : '',
          isShowering ? 'is-showering' : '',
        ].filter(Boolean).join(' ')}
        type="button"
        aria-label={copy.totalStarsOpen}
        aria-expanded={isOpen}
        onClick={onToggleOpen}
      >
        <span className="total-star-orb" aria-hidden="true">
          <span className="star-orbit orbit-one" />
          <span className="star-orbit orbit-two" />
          <Sparkles size={18} strokeWidth={2} />
        </span>
        <span className="total-stars-copy">
          <strong>{run.totalStars}</strong>
          <span>{copy.totalStars}</span>
        </span>
        <span className="star-shower" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>

      {isOpen ? (
        <div className="pomodoro-metric-popover total-stars-popover" role="dialog" aria-label={copy.totalStarsPanelTitle}>
          <div className="metric-popover-head">
            <span className="metric-hero-orb constellation-hero" aria-hidden="true">
              <span className="star-orbit orbit-one" />
              <span className="star-orbit orbit-two" />
              <Star size={46} strokeWidth={1.8} />
              <Sparkles size={24} strokeWidth={2} />
            </span>
            <button
              className="quiet-icon metric-close"
              type="button"
              aria-label={copy.closeTotalStarsPanel}
              onClick={onClose}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="metric-hero-copy">
            <strong>{run.totalStars}</strong>
            <span>{copy.totalStarsPanelTitle}</span>
          </div>
          <div className="metric-week-head">
            <span>{copy.weekTitle}</span>
            <strong>{copy.weekStars(week.weekStars)}</strong>
          </div>
          <MetricWeekRow days={week.days} weekdays={copy.weekdays} variant="stars" />
          <div className="star-week-strip">
            <span>{copy.activeStarDays}</span>
            <strong>{copy.activeDays(week.activeDays)}</strong>
          </div>
          <div className="metric-panel-stats">
            <span>
              <small>{copy.todayStars}</small>
              <strong>{week.todayStars}</strong>
            </span>
            <span>
              <small>{copy.weekTotal}</small>
              <strong>{week.weekStars}</strong>
            </span>
            <span>
              <small>{copy.bestStarDay}</small>
              <strong>{week.bestDayStars}</strong>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
