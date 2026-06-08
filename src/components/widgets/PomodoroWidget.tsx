import { Minus, Pause, Play, Plus, RotateCcw, Sparkle, Star } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { timerSeconds } from '../../lib/timer'
import { clampPomodoros } from '../../lib/todos'
import type { PomodoroRunState, TimerMode, TimerSettings } from '../../types/app'

const TIMER_MODES: TimerMode[] = ['focus', 'shortBreak', 'longBreak']

const TIMER_LABELS: Record<TimerMode, string> = {
  focus: 'Focus',
  shortBreak: 'Break',
  longBreak: 'Long break',
}

const TIMER_BEEP_PEAK_GAIN = 0.16

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(
    2,
    '0',
  )}`
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
  onFocusComplete: () => void
}

export function PomodoroWidget({
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
  onFocusComplete,
}: PomodoroWidgetProps) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const lastBeepAtRef = useRef(0)
  const target = clampPomodoros(run.targetPomodoros)
  const longBreakEvery = clampPomodoros(timerSettings.longBreakEvery)
  const filledStars = Math.min(run.currentRun, target)
  const objectiveFinished = run.completedInTarget >= target

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

  useEffect(() => {
    if (!isRunning) {
      return
    }

    const interval = window.setInterval(() => {
      onRemainingChange((current) => {
        if (current > 1) {
          return current - 1
        }

        window.clearInterval(interval)
        playTimerBeep()

        if (mode === 'focus') {
          onFocusComplete()
          const nextRunCount = run.currentRun + 1
          const nextCompleted = Math.min(run.completedInTarget + 1, target)
          const objectiveComplete = nextCompleted >= target
          onRunChange({
            ...run,
            targetPomodoros: target,
            currentRun: nextRunCount,
            bestRun: Math.max(run.bestRun, nextRunCount),
            totalStars: (run.totalStars ?? 0) + 1,
            lastStarAt: Date.now(),
            completedInTarget: nextCompleted,
          })

          if (objectiveComplete) {
            onRunningChange(false)
            return 0
          }

          switchMode(
            nextRunCount % longBreakEvery === 0 ? 'longBreak' : 'shortBreak',
            run.autoCycle,
          )
          return 0
        }

        switchMode('focus', run.autoCycle)
        return 0
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [
    isRunning,
    longBreakEvery,
    mode,
    onFocusComplete,
    onRemainingChange,
    onRunChange,
    onRunningChange,
    playTimerBeep,
    run,
    switchMode,
    target,
  ])

  const chooseMode = (nextMode: TimerMode) => {
    interruptRun()
    switchMode(nextMode, false)
  }

  const startOrPause = () => {
    if (isRunning) {
      interruptRun()
      onRunningChange(false)
      return
    }

    if (objectiveFinished) {
      return
    }

    primeTimerBeep()
    onRunningChange(true)
  }

  const updateTarget = (delta: number) => {
    onTargetChange(clampPomodoros(target + delta))
  }

  return (
    <div className="pomodoro-widget">
      <div className="segmented-control" aria-label="Timer mode">
        {TIMER_MODES.map((timerMode) => (
          <button
            key={timerMode}
            className={timerMode === mode ? 'is-selected' : ''}
            type="button"
            onClick={() => chooseMode(timerMode)}
          >
            {TIMER_LABELS[timerMode]}
          </button>
        ))}
      </div>

      <div className="timer-readout">{formatTime(remaining)}</div>

      <div className="pomodoro-chain" aria-label="Continuous pomodoro streak">
        {objectiveFinished ? (
          <div className="finished-banner" aria-live="polite">
            <span aria-hidden="true">
              <Star size={12} strokeWidth={1.8} />
              <Sparkle size={13} strokeWidth={1.8} />
              <Star size={10} strokeWidth={1.8} />
            </span>
            <strong>Finished!</strong>
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
            {run.currentRun}/{target} continuous
          </span>
          <span>Best {run.bestRun}</span>
        </div>
      </div>

      <div className="pomodoro-objective-panel">
        <span>{activeTaskLabel ? `Current: ${activeTaskLabel}` : 'No task in progress'}</span>
        <div className="goal-stepper small" aria-label="Pomodoro chain target">
          <button
            type="button"
            aria-label="Decrease pomodoro chain target"
            onClick={() => updateTarget(-1)}
          >
            <Minus size={13} strokeWidth={1.9} />
          </button>
          <strong>{target}</strong>
          <button
            type="button"
            aria-label="Increase pomodoro chain target"
            onClick={() => updateTarget(1)}
          >
            <Plus size={13} strokeWidth={1.9} />
          </button>
        </div>
      </div>

      <label className="autocycle-toggle">
        <span>Auto cycle</span>
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

      <div className="timer-actions">
        <button
          className="primary-action"
          type="button"
          onClick={startOrPause}
          disabled={objectiveFinished && !isRunning}
        >
          {isRunning ? (
            <Pause size={17} strokeWidth={1.9} />
          ) : (
            <Play size={17} strokeWidth={1.9} />
          )}
          {isRunning ? 'Cut' : 'Start'}
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
          Reset
        </button>
      </div>
    </div>
  )
}
