export type WidgetId =
  | 'pomodoro'
  | 'todo'
  | 'youtube'
  | 'backgrounds'
  | 'revisionDashboard'
  | 'friends'

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
  emoji?: string
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
  revisionEventId?: string
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

export type RevisionWeekday =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun'

export type RevisionMethod = {
  id: string
  name: string
  offsetDays: number[]
  builtIn: boolean
  createdAt: number
  updatedAt: number
}

export type RevisionCourse = {
  id: string
  title: string
  initialDate: string
  professor: string
  part: string
  notes: string
  color: string
  textColor: string
  methodId: string | null
  excludedWeekdays: RevisionWeekday[]
  createdAt: number
  updatedAt: number
}

export type RevisionEventKind = 'initial' | 'review'
export type RevisionEventStatus = 'pending' | 'active' | 'done' | 'skipped'

export type RevisionEvent = {
  id: string
  courseId: string
  scheduledDate: string
  scheduledTime: string | null
  kind: RevisionEventKind
  reviewIndex: number
  totalReviews: number
  status: RevisionEventStatus
  priority: TodoPriority
  difficulty: TodoDifficulty
  requiredPomodoros: number
  completedPomodoros: number
  linkedTodoId?: string
  completedAt: number | null
  timeSpentSeconds: number
}

export type RevisionSettings = {
  selectedWeekStart: string | null
  plannerView: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'
  plannerDate: string | null
}

export type GoogleCalendarEventLink = {
  revisionEventId: string
  googleEventId: string
  syncedAt: number
}

export type GoogleCalendarSyncSummary = {
  created: number
  updated: number
  deleted: number
  repaired: number
  skipped: number
}

export type GoogleCalendarSyncState = {
  enabled: boolean
  lastSyncedAt: number | null
  lastError: string | null
  lastSummary: GoogleCalendarSyncSummary | null
  eventMap: Record<string, GoogleCalendarEventLink>
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

export type FriendInviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

export type FriendProfile = {
  userId: string
  displayName: string
  avatarUrl: string
  friendCode: string
  weekStars: number
  currentStreak: number
  weekRevisionsDone: number
  weekRevisionDailyAverage: number
  totalStars: number
  bestStreak: number
  bestRun: number
  flameStages: SecretFlameStage[]
  flameQuests: FlameQuestId[]
  selectedFlameEffect: FlameQuestEffect | null
  isSelf: boolean
}

export type FriendCodeLookupRelation =
  | 'none'
  | 'self'
  | 'friend'
  | 'pending-sent'
  | 'pending-received'

export type FriendCodeLookup = {
  userId: string
  displayName: string
  avatarUrl: string
  friendCode: string
  relation: FriendCodeLookupRelation
}

export type FriendInvite = {
  id: string
  senderId: string
  senderDisplayName: string
  senderAvatarUrl: string
  recipientId: string | null
  recipientDisplayName: string
  recipientAvatarUrl: string
  status: FriendInviteStatus
  createdAt: string
  updatedAt: string
  respondedAt: string | null
}

export type UserSocialStats = {
  userId: string
  weekStart: string
  weekStars: number
  currentStreak: number
  weekRevisionsDone: number
  weekRevisionDailyAverage: number
  totalStars: number
  bestStreak: number
  bestRun: number
  flameStages: SecretFlameStage[]
  flameQuests: FlameQuestId[]
  selectedFlameEffect: FlameQuestEffect | null
  updatedAt: string | null
}

export type LeaderboardEntry = UserSocialStats & {
  displayName: string
  avatarUrl: string
  isSelf: boolean
  rank: number
}

export type SocialPageTab = 'leaderboard' | 'friends' | 'requests'

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
