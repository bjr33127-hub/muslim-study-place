import type { PomodoroRunState, PomodoroStarDayRecord } from '../types/app'
import { DEFAULT_POMODORO_RUN } from './defaults'
import { clampPomodoros } from './todos'

const MAX_STAR_HISTORY_DAYS = 180

export type PomodoroWeekDay = {
  date: string
  stars: number
  bestRun: number
  isToday: boolean
  isFuture: boolean
}

export type PomodoroWeekSummary = {
  days: PomodoroWeekDay[]
  todayStars: number
  todayBestRun: number
  weekStars: number
  weekBestRun: number
  bestDayStars: number
  activeDays: number
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseDateKey(value: string) {
  const [year = '0', month = '1', day = '1'] = value.split('-')

  return new Date(Number(year), Number(month) - 1, Number(day))
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function cleanPositiveInteger(value: unknown) {
  const number = Number(value)

  return Number.isFinite(number) ? Math.max(Math.floor(number), 0) : 0
}

function normalizeDayRecord(
  date: string,
  value: unknown,
): PomodoroStarDayRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<PomodoroStarDayRecord>

  return {
    date,
    stars: cleanPositiveInteger(candidate.stars),
    bestRun: cleanPositiveInteger(candidate.bestRun),
  }
}

function trimStarHistory(history: Record<string, PomodoroStarDayRecord>) {
  return Object.fromEntries(
    Object.entries(history)
      .sort(([first], [second]) => first.localeCompare(second))
      .slice(-MAX_STAR_HISTORY_DAYS),
  )
}

export function normalizePomodoroRun(
  state: Partial<PomodoroRunState>,
): PomodoroRunState {
  const rawHistory =
    state.starHistory && typeof state.starHistory === 'object'
      ? state.starHistory
      : {}
  const starHistory = Object.fromEntries(
    Object.entries(rawHistory).flatMap(([date, value]) => {
      const record = normalizeDayRecord(date, value)

      return record ? [[date, record] as const] : []
    }),
  )

  return {
    ...DEFAULT_POMODORO_RUN,
    ...state,
    targetPomodoros: clampPomodoros(state.targetPomodoros ?? DEFAULT_POMODORO_RUN.targetPomodoros),
    completedInTarget: cleanPositiveInteger(state.completedInTarget),
    currentRun: cleanPositiveInteger(state.currentRun),
    bestRun: cleanPositiveInteger(state.bestRun),
    totalStars: cleanPositiveInteger(state.totalStars),
    lastStarAt: cleanPositiveInteger(state.lastStarAt),
    autoCycle: state.autoCycle ?? DEFAULT_POMODORO_RUN.autoCycle,
    starHistory: trimStarHistory(starHistory),
  }
}

export function recordPomodoroStar(
  state: PomodoroRunState,
  runCount: number,
  now = new Date(),
): PomodoroRunState {
  const run = normalizePomodoroRun(state)
  const today = dateKey(now)
  const history = { ...run.starHistory }
  const currentDay = history[today] ?? {
    date: today,
    stars: 0,
    bestRun: 0,
  }
  const safeRunCount = cleanPositiveInteger(runCount)

  history[today] = {
    date: today,
    stars: currentDay.stars + 1,
    bestRun: Math.max(currentDay.bestRun, safeRunCount),
  }

  return {
    ...run,
    currentRun: safeRunCount,
    bestRun: Math.max(run.bestRun, safeRunCount),
    totalStars: run.totalStars + 1,
    lastStarAt: now.getTime(),
    starHistory: trimStarHistory(history),
  }
}

export function getPomodoroWeekSummary(
  state: PomodoroRunState,
  now = new Date(),
): PomodoroWeekSummary {
  const run = normalizePomodoroRun(state)
  const today = dateKey(now)
  const todayTime = parseDateKey(today).getTime()
  const mondayOffset = (now.getDay() + 6) % 7
  const start = addDays(now, -mondayOffset)
  const days = Array.from({ length: 7 }, (_, index): PomodoroWeekDay => {
    const dayDate = addDays(start, index)
    const date = dateKey(dayDate)
    const record = run.starHistory[date]

    return {
      date,
      stars: record?.stars ?? 0,
      bestRun: record?.bestRun ?? 0,
      isToday: date === today,
      isFuture: parseDateKey(date).getTime() > todayTime,
    }
  })

  return {
    days,
    todayStars: run.starHistory[today]?.stars ?? 0,
    todayBestRun: run.starHistory[today]?.bestRun ?? 0,
    weekStars: days.reduce((total, day) => total + day.stars, 0),
    weekBestRun: Math.max(0, ...days.map((day) => day.bestRun)),
    bestDayStars: Math.max(0, ...Object.values(run.starHistory).map((day) => day.stars)),
    activeDays: days.filter((day) => day.stars > 0 && !day.isFuture).length,
  }
}
