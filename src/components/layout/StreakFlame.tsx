import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { AppCopy } from '../../lib/i18n'
import { getStreakWeekSummary } from '../../lib/streak'
import type { StreakState, StreakUnlockCue } from '../../types/app'

type StreakFlameProps = {
  streak: StreakState
  copy: AppCopy['streak']
  igniteKey: number
  unlockCue: StreakUnlockCue | null
}

type FlameStage = 'ember' | 'verdant' | 'azure' | 'ultimate'

function getFlameStage(current: number): FlameStage {
  if (current >= 100) {
    return 'ultimate'
  }

  if (current >= 30) {
    return 'azure'
  }

  if (current >= 7) {
    return 'verdant'
  }

  return 'ember'
}

function FlameMark({ large = false, stage }: { large?: boolean; stage: FlameStage }) {
  return (
    <span
      className={['duo-flame', large ? 'is-large' : '', `stage-${stage}`].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <span className="duo-flame-glow" />
      <span className="duo-flame-back" />
      <span className="duo-flame-mid" />
      <span className="duo-flame-core" />
      <span className="duo-spark spark-one" />
      <span className="duo-spark spark-two" />
      <span className="duo-spark spark-three" />
    </span>
  )
}

export function StreakFlame({
  streak,
  copy,
  igniteKey,
  unlockCue,
}: StreakFlameProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isIgniting, setIsIgniting] = useState(false)
  const [activeUnlockCue, setActiveUnlockCue] =
    useState<StreakUnlockCue | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const week = useMemo(() => getStreakWeekSummary(streak), [streak])
  const isLit = streak.current > 0
  const isMilestone = [7, 30, 100, 365].includes(streak.current)
  const flameStage = getFlameStage(streak.current)
  const isUnlocking = Boolean(activeUnlockCue)
  const unlockSubtitle =
    activeUnlockCue?.subtitle ??
    (activeUnlockCue?.taskLabel
      ? `${copy.unlockSubtitle}: ${activeUnlockCue.taskLabel}`
      : copy.unlockSubtitle)
  const progressStyle = {
    '--streak-progress': `${Math.round(week.todayProgress * 100)}%`,
  } as CSSProperties

  useEffect(() => {
    if (!igniteKey) {
      return
    }

    let frame = 0
    const restart = window.setTimeout(() => {
      setIsIgniting(false)
      frame = window.requestAnimationFrame(() => setIsIgniting(true))
    }, 0)
    const timeout = window.setTimeout(() => setIsIgniting(false), 1700)

    return () => {
      window.clearTimeout(restart)
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
    }
  }, [igniteKey])

  useEffect(() => {
    if (!unlockCue) {
      return
    }

    const startTimer = window.setTimeout(() => {
      setActiveUnlockCue(unlockCue)
      setIsUnlocked(false)
    }, 0)
    const unlockTimer = window.setTimeout(() => setIsUnlocked(true), 620)
    const closeTimer = window.setTimeout(() => {
      setActiveUnlockCue(null)
      setIsUnlocked(false)
    }, 2850)

    return () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(unlockTimer)
      window.clearTimeout(closeTimer)
    }
  }, [unlockCue])

  return (
    <div
      className={[
        'streak-shell',
        isOpen ? 'is-open' : '',
        isLit ? 'is-lit' : '',
        isIgniting ? 'is-igniting' : '',
        isMilestone ? 'is-milestone' : '',
        isUnlocking ? 'is-unlocking' : '',
        isUnlocked ? 'is-unlocked' : '',
        `stage-${flameStage}`,
      ].filter(Boolean).join(' ')}
    >
      <button
        className={[
          'streak-flame',
          isLit ? 'is-lit' : '',
          isIgniting ? 'is-igniting' : '',
          isMilestone ? 'is-milestone' : '',
          isUnlocking ? 'is-unlocking' : '',
          `stage-${flameStage}`,
        ].filter(Boolean).join(' ')}
        type="button"
        data-flame-stage={flameStage}
        aria-label={copy.open}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="flame-orb">
          <FlameMark stage={flameStage} />
        </span>
        <span className="streak-copy">
          <strong aria-live="polite">{streak.current}</strong>
          <span>{copy.label}</span>
        </span>
        <small>{copy.goalProgress(streak.todayCount, streak.dailyGoal)}</small>
        <span className="streak-mini-week" aria-hidden="true">
          {week.days.map((day) => (
            <i
              key={day.date}
              className={[
                day.checkedIn ? 'is-lit' : '',
                day.completed ? 'is-complete' : '',
                day.isToday ? 'is-today' : '',
              ].filter(Boolean).join(' ')}
            />
          ))}
        </span>
      </button>

      {activeUnlockCue ? (
        <div
          className={[
            'streak-unlock-card',
            isUnlocked ? 'is-unlocked' : '',
          ].filter(Boolean).join(' ')}
          role="status"
          aria-live="polite"
        >
          <div className="streak-unlock-head">
            <span className="streak-unlock-icon" aria-hidden="true">
              <FlameMark stage={flameStage} />
            </span>
            <span>
              <strong>{copy.unlockTitle}</strong>
              <small>{unlockSubtitle}</small>
            </span>
          </div>
          <div className="streak-unlock-week" aria-label={copy.weekTitle}>
            {week.days.map((day, index) => {
              const isTarget = day.date === activeUnlockCue.date

              return (
                <span
                  key={day.date}
                  className={[
                    'streak-unlock-day',
                    day.checkedIn ? 'is-lit' : '',
                    day.completed ? 'is-complete' : '',
                    day.isFuture ? 'is-future' : '',
                    isTarget ? 'is-unlocking-target' : '',
                    isTarget && isUnlocked ? 'is-unlocked' : '',
                  ].filter(Boolean).join(' ')}
                  title={isTarget ? copy.unlockToday : copy.weekdays[index]}
                >
                  <i />
                  <small>{copy.weekdays[index]}</small>
                </span>
              )
            })}
          </div>
        </div>
      ) : null}

      {isOpen ? (
        <div
          className={['streak-popover', `stage-${flameStage}`].join(' ')}
          role="dialog"
          aria-label={copy.panelTitle}
        >
          <div className="streak-popover-head">
            <div className="streak-hero-flame">
              <FlameMark large stage={flameStage} />
            </div>
            <button
              className="quiet-icon streak-close"
              type="button"
              aria-label={copy.close}
              onClick={() => setIsOpen(false)}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>

          <div className="streak-hero-copy">
            <strong>{copy.currentDays(streak.current)}</strong>
            <span>{copy.currentSubtitle}</span>
          </div>

          <div className="streak-goal-block" style={progressStyle}>
            <div className="streak-goal-label">
              <span>{copy.statsToday}</span>
              <strong>{copy.goalProgress(streak.todayCount, streak.dailyGoal)}</strong>
            </div>
            <div className="streak-goal-meter" aria-hidden="true">
              <span />
            </div>
            <small>
              {week.todayRemaining
                ? copy.todayRemaining(week.todayRemaining)
                : copy.dayComplete}
            </small>
          </div>

          <div className="streak-week-head">
            <span>{copy.weekTitle}</span>
            <strong>{copy.perfectWeekProgress(week.completedDays)}</strong>
          </div>
          <div className="streak-week-row" aria-label={copy.weekTitle}>
            {week.days.map((day, index) => {
              const status = day.completed
                ? copy.dayComplete
                : day.checkedIn
                  ? copy.dayChecked
                  : copy.dayEmpty

              return (
                <span
                  key={day.date}
                  className={[
                    'streak-day',
                    day.checkedIn ? 'is-lit' : '',
                    day.completed ? 'is-complete' : '',
                    day.isToday ? 'is-today' : '',
                    day.isFuture ? 'is-future' : '',
                    activeUnlockCue?.date === day.date ? 'is-unlocking-target' : '',
                    activeUnlockCue?.date === day.date && isUnlocked ? 'is-unlocked' : '',
                  ].filter(Boolean).join(' ')}
                  title={`${copy.weekdays[index]} ${day.date}: ${status}`}
                >
                  <i />
                  <small>{copy.weekdays[index]}</small>
                </span>
              )
            })}
          </div>

          <div className={`perfect-week-strip${week.perfect ? ' is-complete' : ''}`}>
            <span>{copy.perfectWeek}</span>
            <strong>{week.perfect ? copy.perfectWeekDone : `${week.completedDays}/7`}</strong>
          </div>

          <div className="streak-panel-stats">
            <span>
              <small>{copy.statsWeek}</small>
              <strong>{week.checkedInDays}/7</strong>
            </span>
            <span>
              <small>{copy.statsRecord}</small>
              <strong>{streak.best}</strong>
            </span>
            <span>
              <small>{copy.statsFocus}</small>
              <strong>{week.totalCount}</strong>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
