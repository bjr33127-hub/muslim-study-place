import { DEFAULT_TIMER_SETTINGS } from './defaults'
import type { TimerMode, TimerSettings } from '../types/app'

const LIMITS: Record<keyof TimerSettings, [number, number]> = {
  focusMinutes: [1, 180],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 90],
  longBreakEvery: [1, 12],
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.round(value || min), min), max)
}

export function normalizeTimerSettings(settings: Partial<TimerSettings>) {
  return {
    focusMinutes: clamp(
      settings.focusMinutes ?? DEFAULT_TIMER_SETTINGS.focusMinutes,
      ...LIMITS.focusMinutes,
    ),
    shortBreakMinutes: clamp(
      settings.shortBreakMinutes ?? DEFAULT_TIMER_SETTINGS.shortBreakMinutes,
      ...LIMITS.shortBreakMinutes,
    ),
    longBreakMinutes: clamp(
      settings.longBreakMinutes ?? DEFAULT_TIMER_SETTINGS.longBreakMinutes,
      ...LIMITS.longBreakMinutes,
    ),
    longBreakEvery: clamp(
      settings.longBreakEvery ?? DEFAULT_TIMER_SETTINGS.longBreakEvery,
      ...LIMITS.longBreakEvery,
    ),
  }
}

export function timerSeconds(mode: TimerMode, settings: TimerSettings) {
  if (mode === 'shortBreak') {
    return settings.shortBreakMinutes * 60
  }

  if (mode === 'longBreak') {
    return settings.longBreakMinutes * 60
  }

  return settings.focusMinutes * 60
}
