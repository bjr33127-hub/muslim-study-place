export type WidgetId =
  | 'pomodoro'
  | 'todo'
  | 'youtube'
  | 'backgrounds'

export type AppLanguage = 'fr' | 'en'

export type WidgetLayout = {
  id: string
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  z: number
}

export type TaskWindow = {
  id: string
  title: string
  rank: number
  createdAt: number
  updatedAt: number
  deletable: boolean
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
  windowId?: string
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

export type SecretFlameStage = 'solar' | 'eclipse' | 'nebula' | 'apogee'
export type BaseFlameStage = 'ember' | 'verdant' | 'azure' | 'ultimate'
export type FlameStage = BaseFlameStage | SecretFlameStage

export type FlameQuestId =
  | 'perfect-week'
  | 'four-perfect-weeks'
  | 'twelve-focus-day'
  | 'hundred-stars'
  | 'ten-run'
  | 'deep-task'
  | 'twenty-five-tasks'

export type FlameQuestEffect =
  | 'seven-lights'
  | 'prismatic-halo'
  | 'comet-trail'
  | 'constellation'
  | 'twin-rings'
  | 'crystal-core'
  | 'runic-sparks'

export type FlameUnlockKey =
  | `stage:${SecretFlameStage}`
  | `quest:${FlameQuestId}`

export type FlameEvolutionState = {
  stages: Partial<Record<SecretFlameStage, number>>
  quests: Partial<Record<FlameQuestId, number>>
  selectedEffect: FlameQuestEffect | null
  seenUnlocks: string[]
  pendingUnlocks: FlameUnlockKey[]
  revealedHints: Partial<Record<FlameUnlockKey, number>>
}

export type FlameEvolutionUnlockCue = {
  key: number
  stages: SecretFlameStage[]
  quests: FlameQuestId[]
  claimKeys: FlameUnlockKey[]
  preview?: boolean
  previewStage?: FlameStage
  previewEffect?: FlameQuestEffect | null
  previewLabel?: string
  previewKind?: 'flame' | 'ascension' | 'quest' | 'group'
}

export type FlamePreviewRequest =
  | {
      kind: 'flame'
      stage: FlameStage
      effect?: FlameQuestEffect | null
      label: string
    }
  | {
      kind: 'ascension'
      stage: SecretFlameStage
    }
  | {
      kind: 'quest'
      quest: FlameQuestId
    }
  | {
      kind: 'group'
    }
  | {
      kind: 'day-unlock'
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
