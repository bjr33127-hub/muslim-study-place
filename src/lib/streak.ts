import type {
  StreakDayRecord,
  StreakDaySource,
  StreakState,
} from '../types/app'
import { DEFAULT_STREAK } from './defaults'

const MAX_HISTORY_DAYS = 180
const sourceOrder: Record<StreakDaySource, number> = {
  'check-in': 1,
  activity: 2,
  manual: 3,
}

export type StreakWeekDay = {
  date: string
  count: number
  goal: number
  checkedIn: boolean
  completed: boolean
  isToday: boolean
  isFuture: boolean
  source: StreakDaySource | null
}

export type StreakWeekSummary = {
  days: StreakWeekDay[]
  checkedInDays: number
  completedDays: number
  totalCount: number
  perfect: boolean
  todayProgress: number
  todayRemaining: number
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

function clampDailyGoal(value: number | undefined) {
  return Math.min(Math.max(value || DEFAULT_STREAK.dailyGoal, 1), 12)
}

function cleanCount(value: unknown) {
  return Math.max(Number.isFinite(Number(value)) ? Number(value) : 0, 0)
}

function normalizeSource(value: unknown): StreakDaySource {
  return value === 'activity' || value === 'manual' ? value : 'check-in'
}

function strongestSource(
  current: StreakDaySource,
  next: StreakDaySource,
): StreakDaySource {
  return sourceOrder[next] > sourceOrder[current] ? next : current
}

function createDayRecord(
  date: string,
  count: number,
  goal: number,
  source: StreakDaySource,
  checkedIn = count > 0,
): StreakDayRecord {
  const safeGoal = clampDailyGoal(goal)
  const safeCount = cleanCount(count)

  return {
    date,
    count: safeCount,
    goal: safeGoal,
    checkedIn,
    completed: safeCount >= safeGoal,
    source,
  }
}

function normalizeDayRecord(
  date: string,
  value: unknown,
  fallbackGoal: number,
): StreakDayRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<StreakDayRecord>
  const goal = clampDailyGoal(candidate.goal || fallbackGoal)
  const count = cleanCount(candidate.count)
  const checkedIn = Boolean(candidate.checkedIn || count > 0)

  return {
    date,
    count,
    goal,
    checkedIn,
    completed: Boolean(candidate.completed || count >= goal),
    source: normalizeSource(candidate.source),
  }
}

function trimHistory(history: Record<string, StreakDayRecord>) {
  return Object.fromEntries(
    Object.entries(history)
      .sort(([first], [second]) => first.localeCompare(second))
      .slice(-MAX_HISTORY_DAYS),
  )
}

function historyFromLegacy(state: Partial<StreakState>, safeDailyGoal: number) {
  if (!state.lastActiveDate || !state.current) {
    return {}
  }

  const lastActiveDate = parseDateKey(state.lastActiveDate)
  const history: Record<string, StreakDayRecord> = {}

  for (let index = Math.max(Math.floor(state.current), 0) - 1; index >= 0; index -= 1) {
    const date = dateKey(addDays(lastActiveDate, -index))
    const isLastActiveDate = date === state.lastActiveDate
    const count = isLastActiveDate
      ? Math.max(cleanCount(state.todayCount), 1)
      : safeDailyGoal

    history[date] = createDayRecord(
      date,
      count,
      safeDailyGoal,
      'check-in',
      true,
    )
  }

  return history
}

function normalizeHistory(state: Partial<StreakState>, safeDailyGoal: number) {
  const rawHistory =
    state.history && typeof state.history === 'object' ? state.history : {}
  const entries = Object.entries(rawHistory).flatMap(([date, value]) => {
    const record = normalizeDayRecord(date, value, safeDailyGoal)

    return record ? [[date, record] as const] : []
  })
  const history = Object.fromEntries(entries)

  if (Object.keys(history).length) {
    return trimHistory(history)
  }

  return historyFromLegacy(state, safeDailyGoal)
}

function upsertDayRecord(
  history: Record<string, StreakDayRecord>,
  date: string,
  patch: {
    count?: number
    goal?: number
    checkedIn?: boolean
    source?: StreakDaySource
  },
) {
  const current =
    history[date] ?? createDayRecord(date, 0, patch.goal ?? DEFAULT_STREAK.dailyGoal, 'check-in', false)
  const count = patch.count === undefined ? current.count : cleanCount(patch.count)
  const goal = clampDailyGoal(patch.goal ?? current.goal)
  const checkedIn = patch.checkedIn ?? (current.checkedIn || count > 0)
  const source = patch.source
    ? strongestSource(current.source, patch.source)
    : current.source

  history[date] = {
    date,
    count,
    goal,
    checkedIn,
    completed: count >= goal,
    source,
  }
}

export function todayKey() {
  return dateKey(new Date())
}

export function millisecondsUntilNextLocalMidnight(now = new Date()) {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  )

  return Math.max(nextMidnight.getTime() - now.getTime(), 1000)
}

export function recordDailyCheckIn(
  state: StreakState,
  now = new Date(),
): StreakState {
  const streak = normalizeStreak(state)
  const today = dateKey(now)
  const yesterday = dateKey(addDays(now, -1))
  const safeDailyGoal = clampDailyGoal(streak.dailyGoal)
  const history = { ...streak.history }

  if (streak.lastActiveDate === today) {
    const todayCount = Math.max(streak.todayCount, 1)
    upsertDayRecord(history, today, {
      count: todayCount,
      goal: safeDailyGoal,
      checkedIn: true,
      source: 'check-in',
    })

    return {
      ...streak,
      dailyGoal: safeDailyGoal,
      todayCount,
      history: trimHistory(history),
    }
  }

  const nextCurrent = streak.lastActiveDate === yesterday ? streak.current + 1 : 1

  upsertDayRecord(history, today, {
    count: 1,
    goal: safeDailyGoal,
    checkedIn: true,
    source: 'check-in',
  })

  return {
    ...streak,
    current: nextCurrent,
    best: Math.max(streak.best, nextCurrent),
    lastActiveDate: today,
    todayCount: 1,
    dailyGoal: safeDailyGoal,
    history: trimHistory(history),
  }
}

export function recordStreakActivity(
  state: StreakState,
  now = new Date(),
): StreakState {
  const checkedIn = recordDailyCheckIn(state, now)
  const today = dateKey(now)

  if (state.lastActiveDate !== today) {
    return checkedIn
  }

  const history = { ...checkedIn.history }
  const todayRecord = history[today]
  const nextTodayCount = (todayRecord?.count ?? checkedIn.todayCount) + 1

  upsertDayRecord(history, today, {
    count: nextTodayCount,
    goal: checkedIn.dailyGoal,
    checkedIn: true,
    source: 'activity',
  })

  return {
    ...checkedIn,
    todayCount: nextTodayCount,
    history: trimHistory(history),
  }
}

export function setStreakDailyGoal(
  state: StreakState,
  value: number,
  now = new Date(),
): StreakState {
  const streak = normalizeStreak(state)
  const dailyGoal = clampDailyGoal(value)
  const today = dateKey(now)
  const history = { ...streak.history }

  if (history[today]) {
    upsertDayRecord(history, today, { goal: dailyGoal })
  }

  return {
    ...streak,
    dailyGoal,
    history: trimHistory(history),
  }
}

export function addSimulatedStreakDay(
  state: StreakState,
  now = new Date(),
): StreakState {
  const checkedIn = recordDailyCheckIn(state, now)
  const history = { ...checkedIn.history }
  const anchorDate = parseDateKey(checkedIn.lastActiveDate ?? dateKey(now))
  let extraDay = dateKey(addDays(anchorDate, -checkedIn.current))

  while (history[extraDay]) {
    extraDay = dateKey(addDays(parseDateKey(extraDay), -1))
  }

  upsertDayRecord(history, extraDay, {
    count: checkedIn.dailyGoal,
    goal: checkedIn.dailyGoal,
    checkedIn: true,
    source: 'manual',
  })

  const nextCurrent = checkedIn.current + 1

  return {
    ...checkedIn,
    current: nextCurrent,
    best: Math.max(checkedIn.best, nextCurrent),
    history: trimHistory(history),
  }
}

export function getStreakWeekSummary(
  state: StreakState,
  now = new Date(),
): StreakWeekSummary {
  const streak = normalizeStreak(state)
  const today = dateKey(now)
  const todayTime = parseDateKey(today).getTime()
  const mondayOffset = (now.getDay() + 6) % 7
  const start = addDays(now, -mondayOffset)
  const days = Array.from({ length: 7 }, (_, index): StreakWeekDay => {
    const dayDate = addDays(start, index)
    const date = dateKey(dayDate)
    const record = streak.history[date]
    const count = record?.count ?? 0
    const goal = record?.goal ?? streak.dailyGoal
    const checkedIn = Boolean(record?.checkedIn)
    const completed = Boolean(record?.completed || count >= goal)
    const isFuture = parseDateKey(date).getTime() > todayTime

    return {
      date,
      count,
      goal,
      checkedIn,
      completed,
      isToday: date === today,
      isFuture,
      source: record?.source ?? null,
    }
  })
  const checkedInDays = days.filter((day) => day.checkedIn && !day.isFuture).length
  const completedDays = days.filter((day) => day.completed && !day.isFuture).length
  const totalCount = days.reduce((sum, day) => sum + day.count, 0)
  const todayRecord = streak.history[today]
  const todayCount = todayRecord?.count ?? streak.todayCount
  const todayGoal = todayRecord?.goal ?? streak.dailyGoal

  return {
    days,
    checkedInDays,
    completedDays,
    totalCount,
    perfect: days.every((day) => day.completed && !day.isFuture),
    todayProgress: Math.min(todayCount / todayGoal, 1),
    todayRemaining: Math.max(todayGoal - todayCount, 0),
  }
}

export function normalizeStreak(state: Partial<StreakState>): StreakState {
  const safeDailyGoal = clampDailyGoal(state.dailyGoal)
  const history = normalizeHistory(state, safeDailyGoal)
  const today = todayKey()
  const todayRecord = history[today]

  return {
    ...DEFAULT_STREAK,
    ...state,
    current: Math.max(Math.floor(state.current ?? DEFAULT_STREAK.current), 0),
    best: Math.max(Math.floor(state.best ?? DEFAULT_STREAK.best), 0),
    todayCount: todayRecord?.count ?? Math.max(Math.floor(state.todayCount ?? 0), 0),
    dailyGoal: safeDailyGoal,
    history,
  }
}
