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

export type StreakDaySource = 'check-in' | 'activity' | 'manual'

export type StreakDayRecord = {
  date: string
  count: number
  goal: number
  checkedIn: boolean
  completed: boolean
  source: StreakDaySource
}

export type StreakState = {
  current: number
  best: number
  lastActiveDate: string | null
  todayCount: number
  dailyGoal: number
  history: Record<string, StreakDayRecord>
}

export type StreakUnlockCue = {
  key: number
  date: string
  taskLabel?: string
  subtitle?: string
}

export type PomodoroRunState = {
  targetPomodoros: number
  completedInTarget: number
  currentRun: number
  bestRun: number
  totalStars: number
  lastStarAt: number
  autoCycle: boolean
  starHistory: Record<string, PomodoroStarDayRecord>
}

export type PomodoroStarDayRecord = {
  date: string
  stars: number
  bestRun: number
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

export type AuthUserProfile = {
  id: string
  email: string
  displayName: string
  avatarUrl: string
}

export type CloudSnapshot = {
  app: 'muslim-study-place'
  version: 1
  exportedAt: string
  values: Record<string, unknown>
}

export type CloudSyncPhase =
  | 'unconfigured'
  | 'signed-out'
  | 'checking'
  | 'conflict'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'

export type CloudSyncStatus = {
  phase: CloudSyncPhase
  configured: boolean
  revision: number | null
  lastSyncedAt: number | null
  message?: string
}

export type CloudRemoteState = {
  snapshot: CloudSnapshot
  revision: number
  updatedAt: string | null
}

export type CloudConflictState = {
  local: CloudSnapshot
  remote: CloudRemoteState
}
