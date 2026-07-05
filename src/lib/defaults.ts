import type {
  BackgroundAsset,
  FlameEvolutionState,
  GoogleCalendarSyncState,
  PomodoroRunState,
  RevisionSettings,
  StreakState,
  TimerSettings,
  WidgetId,
  WidgetLayout,
} from '../types/app'
import { publicPath } from './publicPath'

export const YOUTUBE_DEFAULT_VIDEO_ID = 'KdUCQN_q7Ms'
export const YOUTUBE_DEFAULT_PLAYLIST_ID = 'PL5JBifZsekUp4P9gf3WbAma9xkvz9AzrS'
export const YOUTUBE_DEFAULT_URL =
  `https://www.youtube.com/watch?v=${YOUTUBE_DEFAULT_VIDEO_ID}&list=${YOUTUBE_DEFAULT_PLAYLIST_ID}`

export const BUILT_IN_BACKGROUNDS: BackgroundAsset[] = [
  {
    id: 'train',
    label: 'Train',
    kind: 'video',
    src: publicPath('backgrounds/train.f244a946.mp4'),
    source: 'built-in',
    attribution: 'Astrostation, MIT License',
  },
]

export const WIDGET_ORDER: WidgetId[] = [
  'pomodoro',
  'todo',
  'revisionDashboard',
  'friends',
  'youtube',
  'backgrounds',
]

export const DEFAULT_LAYOUTS: Record<WidgetId, WidgetLayout> = {
  pomodoro: {
    id: 'pomodoro',
    x: 100,
    y: 96,
    width: 360,
    height: 450,
    visible: true,
    z: 3,
  },
  todo: {
    id: 'todo',
    x: 872,
    y: 96,
    width: 386,
    height: 430,
    visible: true,
    z: 4,
  },
  revisionDashboard: {
    id: 'revisionDashboard',
    x: 470,
    y: 96,
    width: 386,
    height: 420,
    visible: true,
    z: 5,
  },
  friends: {
    id: 'friends',
    x: 20,
    y: 456,
    width: 360,
    height: 360,
    visible: false,
    z: 6,
  },
  youtube: {
    id: 'youtube',
    x: 100,
    y: 566,
    width: 386,
    height: 330,
    visible: true,
    z: 7,
  },
  backgrounds: {
    id: 'backgrounds',
    x: 872,
    y: 546,
    width: 386,
    height: 272,
    visible: true,
    z: 8,
  },
}

export const WIDGET_LABELS: Record<WidgetId, string> = {
  pomodoro: 'Focus Timer',
  todo: 'Todo',
  revisionDashboard: 'Revision Dashboard',
  friends: 'Friends',
  youtube: 'YouTube',
  backgrounds: 'Backgrounds',
}

export const DEFAULT_STREAK: StreakState = {
  current: 0,
  best: 0,
  lastActiveDate: null,
  todayCount: 0,
  dailyGoal: 1,
  history: {},
}

export const DEFAULT_FLAME_EVOLUTION: FlameEvolutionState = {
  stages: {},
  quests: {},
  selectedEffect: null,
  seenUnlocks: [],
  pendingUnlocks: [],
  revealedHints: {},
}

export const DEFAULT_POMODORO_RUN: PomodoroRunState = {
  targetPomodoros: 4,
  completedInTarget: 0,
  currentRun: 0,
  bestRun: 0,
  totalStars: 0,
  lastStarAt: 0,
  autoCycle: true,
  starHistory: {},
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
}

export const DEFAULT_REVISION_SETTINGS: RevisionSettings = {
  selectedWeekStart: null,
  plannerView: 'dayGridMonth',
  plannerDate: null,
}

export const DEFAULT_GOOGLE_CALENDAR_SYNC: GoogleCalendarSyncState = {
  enabled: false,
  lastSyncedAt: null,
  lastError: null,
  lastSummary: null,
  eventMap: {},
}

export function mergeDefaultLayouts(
  stored: Partial<Record<WidgetId, WidgetLayout>>,
): Record<WidgetId, WidgetLayout> {
  return WIDGET_ORDER.reduce(
    (layouts, id) => {
      layouts[id] = { ...DEFAULT_LAYOUTS[id], ...stored[id], id }
      return layouts
    },
    {} as Record<WidgetId, WidgetLayout>,
  )
}
