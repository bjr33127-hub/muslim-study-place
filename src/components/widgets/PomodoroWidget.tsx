import {
  Coffee,
  Flame,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Sparkle,
  Star,
} from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import type { ComponentType } from 'react'
import type { AppCopy } from '../../lib/i18n'
import { timerSeconds } from '../../lib/timer'
import { clampPomodoros } from '../../lib/todos'
import type {
  AppLanguage,
  PomodoroRunState,
  TimerMode,
  TimerSettings,
} from '../../types/app'

const TIMER_MODES: TimerMode[] = ['focus', 'shortBreak', 'longBreak']

const TIMER_BEEP_PEAK_GAIN = 0.16
const TIMER_RING_SIZE = 164
const TIMER_RING_CENTER = TIMER_RING_SIZE / 2
const TIMER_RING_RADIUS = 72

const modeIcons: Record<TimerMode, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  focus: Flame,
  shortBreak: Coffee,
  longBreak: Moon,
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(
    2,
    '0',
  )}`
}

function formatClockTime(timestamp: number, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(timestamp)
}

function scheduleTimerChime(context: AudioContext) {
  const start = context.currentTime + 0.02
  const master = context.createGain()
  const tones = [
    { frequency: 720, delay: 0, duration: 0.22 },
    { frequency: 920, delay: 0.18, duration: 0.28 },
  ]

  master.gain.setValueAtTime(0.0001, start)
  master.gain.exponentialRampToValueAtTime(TIMER_BEEP_PEAK_GAIN, start + 0.035)
  master.gain.exponentialRampToValueAtTime(0.0001, start + 0.62)
  master.connect(context.destination)

  tones.forEach((tone, index) => {
    const oscillator = context.createOscillator()
    const toneStart = start + tone.delay

    oscillator.type = index === 0 ? 'sine' : 'triangle'
    oscillator.frequency.setValueAtTime(tone.frequency, toneStart)
    oscillator.connect(master)
    oscillator.start(toneStart)
    oscillator.stop(toneStart + tone.duration)

    oscillator.onended = () => {
      oscillator.disconnect()

      if (index === tones.length - 1) {
        master.disconnect()
      }
    }
  })
}

type PomodoroWidgetProps = {
  copy: AppCopy['pomodoro']
  currentTime: number
  estimatedEndAt: number
  language: AppLanguage
  mode: TimerMode
  remaining: number
  isRunning: boolean
  run: PomodoroRunState
  timerSettings: TimerSettings
  activeTaskLabel?: string
  onModeChange: (mode: TimerMode) => void
  onRemainingChange: (value: number | ((current: number) => number)) => void
  onRunningChange: (value: boolean | ((current: boolean) => boolean)) => void
  onRunChange: (
    value:
      | PomodoroRunState
      | ((current: PomodoroRunState) => PomodoroRunState),
  ) => void
  onTargetChange: (targetPomodoros: number) => void
  onStartFreeFocus: () => void
  onCompleteSegment: () => number
}

export function PomodoroWidget({
  copy,
  currentTime,
  estimatedEndAt,
  language,
  mode,
  remaining,
  isRunning,
  run,
  timerSettings,
  activeTaskLabel,
  onModeChange,
  onRemainingChange,
  onRunningChange,
  onRunChange,
  onTargetChange,
  onStartFreeFocus,
  onCompleteSegment,
}: PomodoroWidgetProps) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const lastBeepAtRef = useRef(0)
  const target = clampPomodoros(run.targetPomodoros)
  const filledStars = Math.min(run.currentRun, target)
  const objectiveFinished = run.completedInTarget >= target
  const earnedStars = Math.max(run.currentRun, run.completedInTarget)
  const finishedStarCount = Math.max(1, earnedStars)
  const canAdjustTarget = !objectiveFinished
  const canSkipSegment = !objectiveFinished
  const duration = Math.max(timerSeconds(mode, timerSettings), 1)
  const elapsed = Math.min(Math.max(duration - remaining, 0), duration)
  const progress = objectiveFinished ? 100 : Math.round((elapsed / duration) * 100)
  const ActiveModeIcon = modeIcons[mode]
  const currentClockText = formatClockTime(currentTime, language)
  const estimatedEndText = formatClockTime(
    estimatedEndAt,
    language,
  )
  const clockTooltip = isRunning
    ? copy.estimatedEnd(estimatedEndText)
    : copy.estimatedEndIfStarted(estimatedEndText)
  const clockLabel = `${copy.currentTime(currentClockText)}. ${clockTooltip}`

  const getAudioContext = useCallback(() => {
    if (audioContextRef.current) {
      return audioContextRef.current
    }

    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext

    if (!AudioContextClass) {
      return null
    }

    audioContextRef.current = new AudioContextClass()
    return audioContextRef.current
  }, [])

  const primeTimerBeep = useCallback(() => {
    const context = getAudioContext()

    if (context?.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }
  }, [getAudioContext])

  const playTimerBeep = useCallback(() => {
    const now = Date.now()

    if (now - lastBeepAtRef.current < 700) {
      return
    }

    const context = getAudioContext()

    if (!context || context.state === 'closed') {
      return
    }

    lastBeepAtRef.current = now

    if (context.state === 'suspended') {
      void context.resume().then(() => scheduleTimerChime(context)).catch(() => undefined)
      return
    }

    scheduleTimerChime(context)
  }, [getAudioContext])

  const interruptRun = () => {
    onRunChange((current) => ({
      ...current,
      currentRun: 0,
      completedInTarget: 0,
    }))
  }

  const switchMode = useCallback((nextMode: TimerMode, keepRunning = false) => {
    onModeChange(nextMode)
    onRemainingChange(timerSeconds(nextMode, timerSettings))
    onRunningChange(keepRunning)
  }, [onModeChange, onRemainingChange, onRunningChange, timerSettings])

  useEffect(() => {
    window.addEventListener('pointerdown', primeTimerBeep, { passive: true })
    window.addEventListener('keydown', primeTimerBeep)

    return () => {
      window.removeEventListener('pointerdown', primeTimerBeep)
      window.removeEventListener('keydown', primeTimerBeep)
    }
  }, [primeTimerBeep])

  useEffect(() => {
    if (!objectiveFinished) {
      return
    }

    if (mode !== 'focus') {
      onModeChange('focus')
    }

    if (remaining !== 0) {
      onRemainingChange(0)
    }

    if (isRunning) {
      onRunningChange(false)
    }
  }, [
    isRunning,
    mode,
    objectiveFinished,
    onModeChange,
    onRemainingChange,
    onRunningChange,
    remaining,
  ])

  const startOrPause = () => {
    if (isRunning) {
      onRunningChange(false)
      return
    }

    if (objectiveFinished) {
      interruptRun()
      switchMode('focus', true)
      return
    }

    primeTimerBeep()
    onRunningChange(true)
  }

  const updateTarget = (delta: number) => {
    if (!canAdjustTarget) {
      return
    }

    onTargetChange(clampPomodoros(target + delta))
  }

  const skipSegment = () => {
    playTimerBeep()
    onRemainingChange(onCompleteSegment())
  }

  return (
    <div className={`pomodoro-widget mode-${mode}`}>
      <div className="pomodoro-cycle" aria-label={copy.modeAria}>
        {TIMER_MODES.map((timerMode) => (
          <div
            key={timerMode}
            className={`cycle-step mode-${timerMode}${
              timerMode === mode ? ' is-current' : ''
            }`}
            aria-current={timerMode === mode ? 'step' : undefined}
          >
            <span>
              {(() => {
                const Icon = modeIcons[timerMode]
                return <Icon size={15} strokeWidth={1.9} />
              })()}
            </span>
            <strong>{copy.modes[timerMode]}</strong>
          </div>
        ))}
      </div>

      <div className="timer-orbital" aria-label={copy.progress(progress)}>
        <time
          className="pomodoro-ambient-clock"
          dateTime={new Date(currentTime).toISOString()}
          aria-label={clockLabel}
          tabIndex={0}
        >
          <span aria-hidden="true">{currentClockText}</span>
          <span className="pomodoro-clock-tooltip" role="tooltip">
            {clockTooltip}
          </span>
        </time>
        <svg className="timer-ring" viewBox={`0 0 ${TIMER_RING_SIZE} ${TIMER_RING_SIZE}`}>
          <circle
            className="timer-ring-track"
            cx={TIMER_RING_CENTER}
            cy={TIMER_RING_CENTER}
            r={TIMER_RING_RADIUS}
            pathLength="100"
          />
          <circle
            className="timer-ring-progress"
            cx={TIMER_RING_CENTER}
            cy={TIMER_RING_CENTER}
            r={TIMER_RING_RADIUS}
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - progress}
          />
        </svg>
        <div className="timer-core">
          <span className="timer-mode-mark" aria-hidden="true">
            <ActiveModeIcon size={25} strokeWidth={1.85} />
          </span>
          <div className="timer-readout">{formatTime(remaining)}</div>
          <small>{copy.modes[mode]}</small>
        </div>
      </div>

      <div className="pomodoro-chain" aria-label={copy.continuousAria}>
        {objectiveFinished ? (
          <div className="finished-banner" aria-live="polite">
            <span
              className="finished-stars"
              aria-label={copy.earnedStars(finishedStarCount)}
            >
              {Array.from({ length: finishedStarCount }, (_, index) => (
                <Star
                  key={index}
                  size={finishedStarCount > 12 ? 9 : finishedStarCount > 8 ? 10 : 12}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              ))}
            </span>
            <strong>{copy.finished}</strong>
          </div>
        ) : (
          <div className="star-row">
            {Array.from({ length: target }, (_, index) => (
              <Star
                key={index}
                size={16}
                strokeWidth={1.8}
                className={[
                  index < filledStars ? 'is-filled' : '',
                  index === filledStars - 1 ? 'is-new' : '',
                ].join(' ')}
              />
            ))}
          </div>
        )}
        <div className="chain-meta">
          <span>
            <Sparkle size={13} strokeWidth={1.8} />
            {copy.continuous(run.currentRun, target)}
          </span>
          <span>{copy.best(run.bestRun)}</span>
        </div>
      </div>

      <div className={`pomodoro-objective-panel${objectiveFinished ? ' is-locked' : ''}`}>
        <span>
          {activeTaskLabel ? copy.currentTask(activeTaskLabel) : copy.freeFocus}
        </span>
        <div
          className={`goal-stepper small${objectiveFinished ? ' is-locked' : ''}`}
          aria-label={copy.targetAria}
          aria-disabled={objectiveFinished}
        >
          <button
            type="button"
            aria-label={copy.decreaseTarget}
            disabled={!canAdjustTarget}
            onClick={() => updateTarget(-1)}
          >
            <Minus size={13} strokeWidth={1.9} />
          </button>
          <strong>{target}</strong>
          <button
            type="button"
            aria-label={copy.increaseTarget}
            disabled={!canAdjustTarget}
            onClick={() => updateTarget(1)}
          >
            <Plus size={13} strokeWidth={1.9} />
          </button>
        </div>
      </div>

      <div className="pomodoro-quick-row">
        <button
          className={`free-pomodoro-button${activeTaskLabel ? '' : ' is-active'}`}
          type="button"
          onClick={onStartFreeFocus}
        >
          <Flame size={15} strokeWidth={1.85} />
          {copy.freeButton}
        </button>

        <label className="autocycle-toggle">
          <span>{copy.autoCycle}</span>
          <input
            type="checkbox"
            checked={run.autoCycle}
            onChange={(event) =>
              onRunChange((current) => ({
                ...current,
                autoCycle: event.target.checked,
              }))
            }
          />
        </label>
      </div>

      <div className={`timer-actions${canSkipSegment ? ' has-skip' : ''}`}>
        <button
          className="primary-action"
          type="button"
          data-guide="pomodoro-start"
          onClick={startOrPause}
        >
          {isRunning ? (
            <Pause size={17} strokeWidth={1.9} />
          ) : (
            <Play size={17} strokeWidth={1.9} />
          )}
          {isRunning ? copy.pause : copy.start}
        </button>
        <button
          className="ghost-action"
          type="button"
          onClick={() => {
            interruptRun()
            switchMode(mode, false)
          }}
        >
          <RotateCcw size={16} strokeWidth={1.8} />
          {copy.reset}
        </button>
        {canSkipSegment ? (
          <button className="ghost-action" type="button" onClick={skipSegment}>
            <SkipForward size={16} strokeWidth={1.8} />
            {copy.skipBreak}
          </button>
        ) : null}
      </div>
    </div>
  )
}
