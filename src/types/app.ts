export type WidgetId =
  | 'pomodoro'
  | 'todo'
  | 'spotify'
  | 'youtube'
  | 'backgrounds'

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

export type TodoItem = {
  id: string
  text: string
  completed: boolean
  active: boolean
  requiredPomodoros: number
  completedPomodoros: number
  createdAt: number
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
