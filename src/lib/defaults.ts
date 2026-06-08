import type {
  BackgroundAsset,
  PomodoroRunState,
  StreakState,
  TimerSettings,
  WidgetId,
  WidgetLayout,
} from '../types/app'
import { publicPath } from './publicPath'

export const SPOTIFY_PLAYLIST_URL =
  'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2QBzaO'

export const YOUTUBE_DEFAULT_VIDEO_ID = 'z23pnK_-0og'

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
  'notes',
  'spotify',
  'youtube',
  'backgrounds',
]

export const DEFAULT_LAYOUTS: Record<WidgetId, WidgetLayout> = {
  pomodoro: {
    id: 'pomodoro',
    x: 100,
    y: 78,
    width: 360,
    height: 430,
    visible: true,
    z: 3,
  },
  todo: {
    id: 'todo',
    x: 948,
    y: 78,
    width: 312,
    height: 386,
    visible: true,
    z: 4,
  },
  notes: {
    id: 'notes',
    x: 100,
    y: 540,
    width: 360,
    height: 360,
    visible: true,
    z: 7,
  },
  spotify: {
    id: 'spotify',
    x: 500,
    y: 78,
    width: 420,
    height: 352,
    visible: true,
    z: 2,
  },
  youtube: {
    id: 'youtube',
    x: 500,
    y: 506,
    width: 420,
    height: 360,
    visible: true,
    z: 5,
  },
  backgrounds: {
    id: 'backgrounds',
    x: 948,
    y: 496,
    width: 312,
    height: 330,
    visible: true,
    z: 6,
  },
}

export const WIDGET_LABELS: Record<WidgetId, string> = {
  pomodoro: 'Focus Timer',
  todo: 'Todo',
  notes: 'Notes',
  spotify: 'Spotify',
  youtube: 'YouTube',
  backgrounds: 'Backgrounds',
}

export const DEFAULT_STREAK: StreakState = {
  current: 0,
  best: 0,
  lastActiveDate: null,
  todayCount: 0,
  dailyGoal: 1,
}

export const DEFAULT_POMODORO_RUN: PomodoroRunState = {
  targetPomodoros: 4,
  completedInTarget: 0,
  currentRun: 0,
  bestRun: 0,
  totalStars: 0,
  lastStarAt: 0,
  autoCycle: true,
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
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
