export type WidgetId =
  | 'pomodoro'
  | 'todo'
  | 'youtube'
  | 'backgrounds'

export type AppLanguage = 'fr' | 'en'

export type WidgetLayout = {
  id: WidgetId
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  z: number
}

export type BackgroundAsset = {
  id: string
  label: string
  kind: 'video' | 'image'
  src: string
  source: 'built-in' | 'folder' | 'upload'
  poster?: string
  attribution?: string
}

export type UploadedBackgroundRecord = {
  id: string
  label: string
  kind: 'video' | 'image'
  blob: Blob
  mimeType: string
  createdAt: number
}

export type TodoPriority = 'urgent' | 'high' | 'medium' | 'low' | 'later'
export type TodoDifficulty = 'easy' | 'normal' | 'hard' | 'intense'

export type TodoItem = {
  id: string
  text: string
  priority: TodoPriority
  difficulty: TodoDifficulty
  rank: number
  completed: boolean
  active: boolean
  requiredPomodoros: number
  completedPomodoros: number
  createdAt: number
  updatedAt: number
  completedAt: number | null
  repeatOf?: string
  repeatIndex: number
}

export type TimerMode = 'focus' | 'shortBreak' | 'longBreak'

export type TimerSettings = {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  longBreakEvery: number
}

export type StreakState = {
  current: number
  best: number
  lastActiveDate: string | null
  todayCount: number
  dailyGoal: number
}

export type PomodoroRunState = {
  targetPomodoros: number
  completedInTarget: number
  currentRun: number
  bestRun: number
  totalStars: number
  lastStarAt: number
  autoCycle: boolean
}

export type TaskPomodoroMemory = {
  mode: TimerMode
  remaining: number
  targetPomodoros: number
  completedInTarget: number
  currentRun: number
}

export type MemoryStatus = {
  available: boolean
  keyCount: number
  updatedAt: number | null
  restored: boolean
  error?: string
}
