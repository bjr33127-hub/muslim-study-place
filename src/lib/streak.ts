import type { StreakState } from '../types/app'
import { DEFAULT_STREAK } from './defaults'

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function todayKey() {
  return dateKey(new Date())
}

export function recordStreakActivity(state: StreakState): StreakState {
  const today = todayKey()
  const yesterday = dateKey(addDays(new Date(), -1))
  const safeDailyGoal = Math.min(Math.max(state.dailyGoal || 1, 1), 12)

  if (state.lastActiveDate === today) {
    return {
      ...state,
      dailyGoal: safeDailyGoal,
      todayCount: state.todayCount + 1,
    }
  }

  const nextCurrent = state.lastActiveDate === yesterday ? state.current + 1 : 1

  return {
    ...state,
    current: nextCurrent,
    best: Math.max(state.best, nextCurrent),
    lastActiveDate: today,
    todayCount: 1,
    dailyGoal: safeDailyGoal,
  }
}

export function normalizeStreak(state: Partial<StreakState>): StreakState {
  return {
    ...DEFAULT_STREAK,
    ...state,
    dailyGoal: Math.min(Math.max(state.dailyGoal || DEFAULT_STREAK.dailyGoal, 1), 12),
  }
}
