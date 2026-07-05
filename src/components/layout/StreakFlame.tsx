import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { AppCopy } from '../../lib/i18n'
import {
  FLAME_QUEST_EFFECTS,
  FLAME_QUEST_IDS,
  getBaseFlameStage,
  getActiveSecretFlameStage,
} from '../../lib/flameEvolution'
import { getStreakWeekSummary } from '../../lib/streak'
import type {
  FlameEvolutionState,
  FlameEvolutionUnlockCue,
  FlameQuestEffect,
  StreakState,
  StreakUnlockCue,
} from '../../types/app'
import { FlameEvolutionReveal } from './FlameEvolutionReveal'
import { FlameMark } from './FlameVisual'

type StreakFlameProps = {
  streak: StreakState
  copy: AppCopy['streak']
  igniteKey: number
  unlockCue: StreakUnlockCue | null
  evolution: FlameEvolutionState
  evolutionCue: FlameEvolutionUnlockCue | null
  isOpen: boolean
  onToggleOpen: () => void
  onClose: () => void
  onEffectChange: (effect: FlameQuestEffect | null) => void
  onClaimEvolution: (cue: FlameEvolutionUnlockCue) => void
}

export function StreakFlame({
  streak,
  copy,
  igniteKey,
  unlockCue,
  evolution,
  evolutionCue,
  isOpen,
  onToggleOpen,
  onClose,
  onEffectChange,
  onClaimEvolution,
}: StreakFlameProps) {
  const [isIgniting, setIsIgniting] = useState(false)
  const [activeUnlockCue, setActiveUnlockCue] =
    useState<StreakUnlockCue | null>(null)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const week = useMemo(() => getStreakWeekSummary(streak), [streak])
  const isLit = streak.current > 0
  const isMilestone = [7, 30, 100, 120, 150, 200, 300, 365].includes(streak.current)
  const secretStage = getActiveSecretFlameStage(evolution)
  const baseFlameStage = getBaseFlameStage(streak.current)
  const flameStage = secretStage ?? baseFlameStage
  const currentStageName = secretStage
    ? copy.stageNames[secretStage]
    : copy.baseStageNames[baseFlameStage]
  const selectedEffect = evolution.selectedEffect
  const isUnlocking = Boolean(activeUnlockCue)
  const isAscending = Boolean(evolutionCue)
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
        isAscending ? 'is-ascending' : '',
        selectedEffect ? `effect-${selectedEffect}` : '',
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
          isAscending ? 'is-ascending' : '',
          selectedEffect ? `effect-${selectedEffect}` : '',
          `stage-${flameStage}`,
        ].filter(Boolean).join(' ')}
        type="button"
        data-flame-stage={flameStage}
        data-flame-effect={selectedEffect ?? 'none'}
        aria-label={copy.open}
        aria-expanded={isOpen}
        onClick={onToggleOpen}
      >
        <span className="flame-orb">
          <FlameMark effect={selectedEffect} stage={flameStage} />
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
              <FlameMark effect={selectedEffect} stage={flameStage} />
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
              <FlameMark effect={selectedEffect} large stage={flameStage} />
            </div>
            <button
              className="quiet-icon streak-close"
              type="button"
              aria-label={copy.close}
              onClick={onClose}
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

          <div className="flame-secrets">
            <div className="flame-secrets-head">
              <span>{copy.secretTitle}</span>
              <strong>
                {currentStageName}
              </strong>
            </div>
            <div className="flame-ascension-status">
              <small>{copy.ascensionTitle}</small>
              <strong>
                {currentStageName}
              </strong>
            </div>
            <button
              className={`flame-effect-none${selectedEffect === null ? ' is-selected' : ''}`}
              type="button"
              onClick={() => onEffectChange(null)}
            >
              <span>{copy.noSecretEffect}</span>
              <strong>
                {selectedEffect === null ? copy.equippedEffect : copy.equipEffect}
              </strong>
            </button>
            <div className="flame-quest-grid">
              {FLAME_QUEST_IDS.map((quest) => {
                const unlockedAt = evolution.quests[quest]
                const effect = FLAME_QUEST_EFFECTS[quest]
                const selected = selectedEffect === effect

                if (!unlockedAt) {
                  return (
                    <div className="flame-quest is-locked" key={quest}>
                      <span className="flame-quest-glyph" aria-hidden="true">?</span>
                      <span>
                        <strong>{copy.mysteryName}</strong>
                        <small>{copy.questRiddles[quest]}</small>
                      </span>
                    </div>
                  )
                }

                return (
                  <button
                    className={`flame-quest is-unlocked${selected ? ' is-selected' : ''}`}
                    key={quest}
                    type="button"
                    onClick={() => onEffectChange(effect)}
                  >
                    <span className={`flame-quest-glyph effect-${effect}`} aria-hidden="true">
                      <i />
                    </span>
                    <span>
                      <strong>{copy.questNames[quest]}</strong>
                      <small>
                        {copy.unlockedOn(new Date(unlockedAt).toLocaleDateString())}
                      </small>
                    </span>
                    <em>{selected ? copy.equippedEffect : copy.equipEffect}</em>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {evolutionCue ? (
        <FlameEvolutionReveal
          copy={copy}
          cue={evolutionCue}
          stage={evolutionCue.previewStage ?? flameStage}
          effect={
            evolutionCue.preview
              ? evolutionCue.previewEffect ?? null
              : selectedEffect
          }
          onClaim={() => onClaimEvolution(evolutionCue)}
        />
      ) : null}
    </div>
  )
}
