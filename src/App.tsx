import {
  BarChart3,
  CheckSquare,
  Image,
  Pause,
  Play,
  Timer,
  Users,
  Video,
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { BackgroundLayer } from './components/layout/BackgroundLayer'
import { Dock } from './components/layout/Dock'
import { SettingsPanel } from './components/layout/SettingsPanel'
import { TopBar } from './components/layout/TopBar'
import { WidgetFrame } from './components/layout/WidgetFrame'
import { BackgroundsWidget } from './components/widgets/BackgroundsWidget'
import { PomodoroWidget } from './components/widgets/PomodoroWidget'
import { RevisionDashboardWidget } from './components/widgets/RevisionDashboardWidget'
import { TodoWidget } from './components/widgets/TodoWidget'
import { YoutubeWidget } from './components/widgets/YoutubeWidget'
import { useCloudSync } from './hooks/useCloudSync'
import { usePersistentState } from './hooks/usePersistentState'
import { useSocial } from './hooks/useSocial'
import type { GuideTourStep } from './components/layout/GuidePage'
import {
  BUILT_IN_BACKGROUNDS,
  DEFAULT_FLAME_EVOLUTION,
  DEFAULT_LAYOUTS,
  DEFAULT_POMODORO_RUN,
  DEFAULT_GOOGLE_CALENDAR_SYNC,
  DEFAULT_REVISION_SETTINGS,
  DEFAULT_STREAK,
  DEFAULT_TIMER_SETTINGS,
  WIDGET_ORDER,
  mergeDefaultLayouts,
} from './lib/defaults'
import {
  deleteUploadedBackground,
  listUploadedBackgrounds,
  saveUploadedBackground,
} from './lib/backgroundDb'
import {
  recordCloudDailyCheckIn,
  recordCloudStreakActivity,
  getBrowserTimezone,
  setCloudStreakDailyGoal,
} from './lib/cloudSync'
import {
  addSimulatedStreakDay,
  millisecondsUntilNextLocalMidnight,
  normalizeStreak,
  recordDailyCheckIn,
  recordStreakActivity,
  setStreakDailyGoal,
  todayKey,
} from './lib/streak'
import {
  buildPendingFlameEvolutionCue,
  claimFlameEvolutionUnlocks,
  discoverFlameEvolution,
  FLAME_QUEST_IDS,
  normalizeFlameEvolution,
  revealFlameAchievementHint,
  SECRET_FLAME_STAGES,
  selectFlameQuestEffect,
} from './lib/flameEvolution'
import { normalizeTimerSettings, timerSeconds } from './lib/timer'
import {
  clampPomodoros,
  filterAndSortTodos,
  hasOpenTodoForRoot,
  normalizeDifficulty,
  normalizePriority,
  normalizeTodos,
  seedTodos,
  todoRootId,
} from './lib/todos'
import {
  DEFAULT_TASK_WINDOW_ID,
  DEFAULT_TASK_WINDOWS,
  TASK_WINDOW_EMOJIS,
  normalizeTaskWindowLayouts,
  normalizeTaskWindows,
  taskWindowEmojiForIndex,
} from './lib/taskWindows'
import { publicPath } from './lib/publicPath'
import {
  DEFAULT_LANGUAGE,
  getCopy,
  normalizeLanguage,
} from './lib/i18n'
import {
  normalizePomodoroRun,
  getPomodoroWeekSummary,
  recordPomodoroStar,
  recordRevisionManualCompletionReward,
} from './lib/pomodoroRun'
import {
  buildRevisionEventsForCourses,
  completedEventsThisWeek,
  dateKey,
  hydrateRevisionEventsFromLinkedTodos,
  normalizeGoogleCalendarSync,
  normalizeRevisionCourses,
  normalizeRevisionEvents,
  normalizeRevisionMethods,
  normalizeRevisionSubjects,
  normalizeRevisionSettings,
  revisionsDueToday,
  revisionOffsetLabel,
  todayRevisionEvents,
  weekStartKey,
} from './lib/revisions'
import {
  clearGoogleCalendarTokenSession,
  isGoogleCalendarTokenSessionUsable,
  isGoogleCalendarConfigured,
  readGoogleCalendarTokenSession,
  requestGoogleCalendarAccessToken,
  storeGoogleCalendarTokenSession,
  syncRevisionEventsToGoogleCalendar,
} from './lib/googleCalendar'
import {
  buildDurableSnapshot,
  getDurableStorageStatus,
  importDurableSnapshot,
} from './lib/storage'
import type {
  AppLanguage,
  BackgroundAsset,
  FlameEvolutionState,
  FlameEvolutionUnlockCue,
  FlameQuestEffect,
  FlameUnlockKey,
  MemoryStatus,
  PomodoroRunState,
  GoogleCalendarSyncState,
  RevisionCourse,
  RevisionEvent,
  RevisionMethod,
  RevisionSubject,
  RevisionSettings,
  StreakUnlockCue,
  TaskWindow,
  TaskPomodoroMemory,
  TimerSettings,
  TimerMode,
  TodoDifficulty,
  TodoItem,
  TodoPriority,
  WidgetId,
  WidgetLayout,
} from './types/app'

const widgetIcons: Record<WidgetId, ReactNode> = {
  pomodoro: <Timer size={18} strokeWidth={1.8} />,
  todo: <CheckSquare size={18} strokeWidth={1.8} />,
  revisionDashboard: <BarChart3 size={18} strokeWidth={1.8} />,
  friends: <Users size={18} strokeWidth={1.8} />,
  youtube: <Video size={18} strokeWidth={1.8} />,
  backgrounds: <Image size={18} strokeWidth={1.8} />,
}

const FriendsPage = lazy(() =>
  import('./components/layout/FriendsPage').then((module) => ({
    default: module.FriendsPage,
  })),
)

const GuidePage = lazy(() =>
  import('./components/layout/GuidePage').then((module) => ({
    default: module.GuidePage,
  })),
)

const RevisionPlannerPage = lazy(() =>
  import('./components/layout/RevisionPlannerPage').then((module) => ({
    default: module.RevisionPlannerPage,
  })),
)

const CURRENT_LAYOUT_VERSION = 15
const STREAK_TASK_UNLOCK_KEY = 'muslim-study-place:streak:lastTaskUnlockDate'
const STATIC_WIDGET_ORDER = WIDGET_ORDER.filter(
  (id) => id !== 'todo' && id !== 'friends',
)
type MobileWorkspacePage =
  | WidgetId
  | `task:${string}`
  | 'planner'
  | 'friends'
  | 'guide'
  | null

const DEFAULT_MEMORY_STATUS: MemoryStatus = {
  available: false,
  keyCount: 0,
  updatedAt: null,
  restored: false,
}

function createTaskPomodoroMemory(
  task: TodoItem,
  timerSettings: TimerSettings,
): TaskPomodoroMemory {
  const targetPomodoros = clampPomodoros(task.requiredPomodoros)
  const completedInTarget = Math.min(task.completedPomodoros, targetPomodoros)

  return {
    mode: 'focus',
    remaining: timerSeconds('focus', timerSettings),
    targetPomodoros,
    completedInTarget,
    currentRun: completedInTarget,
  }
}

function taskMobilePage(id: string): MobileWorkspacePage {
  return `task:${id}` as `task:${string}`
}

function formatCompactTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function formatClockTime(timestamp: number, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(timestamp)
}

function useCurrentMinute() {
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  useEffect(() => {
    let timeout = 0

    const scheduleNextMinute = () => {
      window.clearTimeout(timeout)
      const now = Date.now()
      timeout = window.setTimeout(() => {
        setCurrentTime(Date.now())
        scheduleNextMinute()
      }, 60_000 - (now % 60_000) + 25)
    }

    const resyncClock = () => {
      if (document.visibilityState === 'visible') {
        setCurrentTime(Date.now())
        scheduleNextMinute()
      }
    }

    scheduleNextMinute()
    window.addEventListener('focus', resyncClock)
    document.addEventListener('visibilitychange', resyncClock)

    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('focus', resyncClock)
      document.removeEventListener('visibilitychange', resyncClock)
    }
  }, [])

  return currentTime
}

type MiniPomodoroButtonProps = {
  mode: TimerMode
  remaining: number
  progress: number
  isRunning: boolean
  label: string
  toggleLabel: string
  clockText: string
  clockDateTime: string
  clockLabel: string
  clockTooltip: string
  onOpen: () => void
  onToggleRunning: () => void
}

function MiniPomodoroButton({
  mode,
  remaining,
  progress,
  isRunning,
  label,
  toggleLabel,
  clockText,
  clockDateTime,
  clockLabel,
  clockTooltip,
  onOpen,
  onToggleRunning,
}: MiniPomodoroButtonProps) {
  const dashOffset = 100 - progress

  return (
    <div className={`mini-pomodoro mode-${mode}`} aria-label={label}>
      <button
        className="mini-pomodoro-orb"
        type="button"
        aria-label={`${label}. ${clockLabel}. ${clockTooltip}`}
        title={clockTooltip}
        onClick={onOpen}
      >
        <span className="mini-pomodoro-dial" aria-hidden="true">
          <svg className="mini-pomodoro-ring" viewBox="0 0 48 48">
            <circle className="mini-pomodoro-track" cx="24" cy="24" r="20" pathLength="100" />
            <circle
              className="mini-pomodoro-progress"
              cx="24"
              cy="24"
              r="20"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={dashOffset}
            />
          </svg>
          <Timer size={15} strokeWidth={2} />
        </span>
        <span className="mini-pomodoro-copy">
          <strong>{formatCompactTime(remaining)}</strong>
          <small>
            <i className={isRunning ? 'is-live' : ''} />
            <time dateTime={clockDateTime}>{clockText}</time>
          </small>
        </span>
      </button>
      <button
        className="mini-pomodoro-toggle"
        type="button"
        aria-label={toggleLabel}
        onClick={onToggleRunning}
      >
        {isRunning ? (
          <Pause size={13} strokeWidth={2} />
        ) : (
          <Play size={13} strokeWidth={2} />
        )}
      </button>
    </div>
  )
}

function syncTaskPomodoroMemory(
  task: TodoItem,
  timerSettings: TimerSettings,
  memory?: TaskPomodoroMemory,
): TaskPomodoroMemory {
  const base = memory ?? createTaskPomodoroMemory(task, timerSettings)
  const targetPomodoros = clampPomodoros(task.requiredPomodoros)
  const completedInTarget = Math.min(task.completedPomodoros, targetPomodoros)

  return {
    ...base,
    targetPomodoros,
    completedInTarget,
    currentRun: Math.min(
      Math.max(base.currentRun, completedInTarget),
      targetPomodoros,
    ),
  }
}

type FolderBackgroundEntry = Partial<BackgroundAsset> & {
  src: string
  label: string
}

const LEGACY_LOCAL_BACKGROUND_IDS: Record<string, string> = {
  'ChatGPT Image 7 juin 2026, 09_07_16': 'oasis',
  'ChatGPT Image 7 juin 2026, 10_39_12': 'japan',
  'ChatGPT Image 7 juin 2026, 10_39_26': 'night-cosy',
}

function canonicalLegacyBackgroundId(label: string) {
  return LEGACY_LOCAL_BACKGROUND_IDS[label] ?? ''
}

function normalizeFolderBackgrounds(data: unknown): BackgroundAsset[] {
  if (!Array.isArray(data)) {
    return []
  }

  return data.flatMap((entry, index) => {
    const candidate = entry as FolderBackgroundEntry

    if (!candidate.src || !candidate.label) {
      return []
    }

    const kind = candidate.kind === 'image' ? 'image' : 'video'
    const src = candidate.src.startsWith('http')
      ? candidate.src
      : publicPath(candidate.src.startsWith('/')
        ? candidate.src
        : `backgrounds/${candidate.src}`)

    return [
      {
        id: candidate.id ?? `folder-${index}`,
        label: candidate.label,
        kind,
        src,
        source: candidate.source === 'built-in' ? 'built-in' : 'folder',
        poster: candidate.poster,
        attribution: candidate.attribution,
      },
    ]
  })
}

function dedupeBackgrounds(backgrounds: BackgroundAsset[]) {
  const byId = new Map<string, BackgroundAsset>()

  backgrounds.forEach((background) => {
    if (!byId.has(background.id)) {
      byId.set(background.id, background)
    }
  })

  return Array.from(byId.values())
}

function App() {
  const [languageState, setLanguageState] = usePersistentState<AppLanguage>(
    'settings:language',
    DEFAULT_LANGUAGE,
  )
  const language = normalizeLanguage(languageState)
  const copy = useMemo(() => getCopy(language), [language])
  const currentTime = useCurrentMinute()
  const cloudSync = useCloudSync()
  const widgetLabels = copy.widgets
  const [storedLayouts, setLayouts] = usePersistentState(
    'widgetLayouts',
    DEFAULT_LAYOUTS,
  )
  const [layoutVersion, setLayoutVersion] = usePersistentState('layoutVersion', 1)
  const layouts = useMemo(
    () => mergeDefaultLayouts(storedLayouts),
    [storedLayouts],
  )
  const [taskWindowsState, setTaskWindows] = usePersistentState<TaskWindow[]>(
    'taskWindows',
    DEFAULT_TASK_WINDOWS,
  )
  const taskWindows = useMemo(
    () => normalizeTaskWindows(taskWindowsState),
    [taskWindowsState],
  )
  const displayedTaskWindows = useMemo(
    () =>
      taskWindows.map((window) => ({
        ...window,
        title:
          window.id === DEFAULT_TASK_WINDOW_ID &&
          window.title === DEFAULT_TASK_WINDOWS[0].title
            ? widgetLabels.todo
            : window.title,
      })),
    [taskWindows, widgetLabels.todo],
  )
  const [storedTaskWindowLayouts, setTaskWindowLayouts] = usePersistentState<
    Record<string, WidgetLayout>
  >('taskWindowLayouts', {})
  const taskWindowLayouts = useMemo(
    () =>
      normalizeTaskWindowLayouts(
        storedTaskWindowLayouts,
        taskWindows,
        layouts.todo ?? DEFAULT_LAYOUTS.todo,
      ),
    [layouts.todo, storedTaskWindowLayouts, taskWindows],
  )
  const [selectedBackgroundId, setSelectedBackgroundId] = usePersistentState(
    'selectedBackground',
    'train',
  )
  const [todosState, setTodos] = usePersistentState<TodoItem[]>('todos', seedTodos)
  const todos = useMemo(() => normalizeTodos(todosState), [todosState])
  const [revisionMethodsState, setRevisionMethods] = usePersistentState<
    RevisionMethod[]
  >('revisionMethods', [])
  const revisionMethods = useMemo(
    () => normalizeRevisionMethods(revisionMethodsState),
    [revisionMethodsState],
  )
  const [revisionSubjectsState, setRevisionSubjects] = usePersistentState<RevisionSubject[]>(
    'revisionSubjects',
    [],
  )
  const revisionSubjects = useMemo(
    () => normalizeRevisionSubjects(revisionSubjectsState),
    [revisionSubjectsState],
  )
  const [revisionCoursesState, setRevisionCourses] = usePersistentState<
    RevisionCourse[]
  >('revisionCourses', [])
  const revisionCourses = useMemo(
    () => normalizeRevisionCourses(revisionCoursesState),
    [revisionCoursesState],
  )
  const [revisionEventsState, setRevisionEvents] = usePersistentState<
    RevisionEvent[]
  >('revisionEvents', [])
  const revisionEvents = useMemo(
    () =>
      hydrateRevisionEventsFromLinkedTodos(
        normalizeRevisionEvents(revisionEventsState),
        todos,
      ),
    [revisionEventsState, todos],
  )
  const [revisionSettingsState, setRevisionSettings] =
    usePersistentState<RevisionSettings>(
      'revisionSettings',
      DEFAULT_REVISION_SETTINGS,
    )
  const revisionSettings = useMemo(
    () => normalizeRevisionSettings(revisionSettingsState),
    [revisionSettingsState],
  )
  const [revisionGoogleCalendarState, setRevisionGoogleCalendar] =
    usePersistentState<GoogleCalendarSyncState>(
      'revisionGoogleCalendar',
      DEFAULT_GOOGLE_CALENDAR_SYNC,
    )
  const revisionGoogleCalendar = useMemo(
    () => normalizeGoogleCalendarSync(revisionGoogleCalendarState),
    [revisionGoogleCalendarState],
  )
  const [initialGoogleCalendarTokenSession] = useState(() =>
    readGoogleCalendarTokenSession(),
  )
  const googleCalendarTokenRef = useRef(initialGoogleCalendarTokenSession)
  const googleCalendarSyncTimerRef = useRef<number>(0)
  const googleCalendarSyncInFlightRef = useRef<Promise<void> | null>(null)
  const googleCalendarSyncSourceRef = useRef({
    courses: revisionCourses,
    events: revisionEvents,
  })
  const [googleCalendarSessionConnected, setGoogleCalendarSessionConnected] =
    useState(() =>
      isGoogleCalendarTokenSessionUsable(initialGoogleCalendarTokenSession),
    )
  const activeTask = todos.find((todo) => todo.active && !todo.completed)
  const activeRevisionEvent = revisionEvents.find(
    (event) => event.status === 'active' && event.completedPomodoros < event.requiredPomodoros,
  )
  const activeRevisionCourse = activeRevisionEvent
    ? revisionCourses.find((course) => course.id === activeRevisionEvent.courseId)
    : undefined
  const [timerMode, setTimerMode] = usePersistentState<TimerMode>(
    'timer:mode',
    'focus',
  )
  const [timerSettingsState, setTimerSettings] = usePersistentState<TimerSettings>(
    'timerSettings',
    DEFAULT_TIMER_SETTINGS,
  )
  const timerSettings = useMemo(
    () => normalizeTimerSettings(timerSettingsState),
    [timerSettingsState],
  )
  const previousTimerSettingsRef = useRef(timerSettings)
  const [timerRemaining, setTimerRemaining] = usePersistentState(
    'timer:remaining',
    timerSeconds('focus', DEFAULT_TIMER_SETTINGS),
  )
  const [timerRunning, setTimerRunning] = usePersistentState('timer:running', false)
  const timerEndAtRef = useRef<number | null>(null)
  const previousTimerSnapshotRef = useRef({
    remaining: timerRemaining,
    running: timerRunning,
  })
  const [pomodoroRun, setPomodoroRun] = usePersistentState(
    'pomodoroRun',
    DEFAULT_POMODORO_RUN,
  )

  useEffect(() => {
    const previous = previousTimerSnapshotRef.current

    if (
      timerRunning &&
      (!previous.running || timerRemaining > previous.remaining || !timerEndAtRef.current)
    ) {
      timerEndAtRef.current = Date.now() + timerRemaining * 1_000
    }

    if (!timerRunning) {
      timerEndAtRef.current = null
    }

    previousTimerSnapshotRef.current = {
      remaining: timerRemaining,
      running: timerRunning,
    }
  }, [timerRemaining, timerRunning])
  const [taskPomodoroMemory, setTaskPomodoroMemory] = usePersistentState<
    Record<string, TaskPomodoroMemory>
  >('taskPomodoroMemory', {})
  const activeTaskMemory = activeTask ? taskPomodoroMemory[activeTask.id] : undefined
  const syncedActiveTaskMemory = useMemo(
    () =>
      activeTask
        ? syncTaskPomodoroMemory(activeTask, timerSettings, activeTaskMemory)
        : undefined,
    [activeTask, activeTaskMemory, timerSettings],
  )
  const normalizedPomodoroRun = useMemo(
    () => normalizePomodoroRun(pomodoroRun),
    [pomodoroRun],
  )
  const run = useMemo(
    () =>
      normalizePomodoroRun({
        ...normalizedPomodoroRun,
        ...(syncedActiveTaskMemory
          ? {
              targetPomodoros: syncedActiveTaskMemory.targetPomodoros,
              completedInTarget: syncedActiveTaskMemory.completedInTarget,
              currentRun: syncedActiveTaskMemory.currentRun,
            }
          : activeRevisionEvent
            ? {
                targetPomodoros: activeRevisionEvent.requiredPomodoros,
                completedInTarget: activeRevisionEvent.completedPomodoros,
                currentRun: activeRevisionEvent.completedPomodoros,
              }
          : {}),
      }),
    [activeRevisionEvent, normalizedPomodoroRun, syncedActiveTaskMemory],
  )
  const previousRunRef = useRef(run)
  const [bestRunBurstKey, setBestRunBurstKey] = useState(0)
  const [streakState, setStreakState] = usePersistentState('streak', DEFAULT_STREAK)
  const streak = useMemo(() => normalizeStreak(streakState), [streakState])
  const [flameEvolutionState, setFlameEvolutionState] =
    usePersistentState<FlameEvolutionState>(
      'flameEvolution',
      DEFAULT_FLAME_EVOLUTION,
    )
  const flameEvolution = useMemo(
    () => normalizeFlameEvolution(flameEvolutionState),
    [flameEvolutionState],
  )
  const socialStats = useMemo(() => {
    const weekStart = weekStartKey()
    const week = getPomodoroWeekSummary(normalizedPomodoroRun)
    const hasAnyStarHistory = Object.values(normalizedPomodoroRun.starHistory).some(
      (day) => day.stars > 0,
    )
    const weekRevisionsDone = completedEventsThisWeek(revisionEvents, weekStart)
      .length

    return {
      weekStart,
      weekStars: week.weekStars
        ? week.weekStars
        : hasAnyStarHistory
          ? 0
          : normalizedPomodoroRun.totalStars,
      currentStreak: streak.current,
      weekRevisionsDone,
      weekRevisionDailyAverage: Math.round((weekRevisionsDone / 7) * 10) / 10,
      totalStars: normalizedPomodoroRun.totalStars,
      bestStreak: streak.best,
      bestRun: normalizedPomodoroRun.bestRun,
      flameStages: SECRET_FLAME_STAGES.filter((stage) =>
        Boolean(flameEvolution.stages[stage]),
      ),
      flameQuests: FLAME_QUEST_IDS.filter((quest) =>
        Boolean(flameEvolution.quests[quest]),
      ),
      selectedFlameEffect: flameEvolution.selectedEffect,
    }
  }, [flameEvolution, normalizedPomodoroRun, revisionEvents, streak])
  const social = useSocial({
    client: cloudSync.client,
    user: cloudSync.user,
    stats: socialStats,
  })
  const previousStreakRef = useRef(streak)
  const [streakIgniteKey, setStreakIgniteKey] = useState(0)
  const lastTaskUnlockDateRef = useRef<string | null>(null)
  const [streakUnlockCue, setStreakUnlockCue] =
    useState<StreakUnlockCue | null>(null)
  const [flameEvolutionPreviewCue, setFlameEvolutionPreviewCue] =
    useState<FlameEvolutionUnlockCue | null>(null)
  const pendingFlameEvolutionCue = useMemo(
    () => buildPendingFlameEvolutionCue(flameEvolution),
    [flameEvolution],
  )
  const flameEvolutionCue =
    flameEvolutionPreviewCue ?? pendingFlameEvolutionCue
  const [backgroundDim, setBackgroundDim] = usePersistentState(
    'settings:backgroundDim',
    72,
  )
  const [particlesEnabled, setParticlesEnabled] = usePersistentState(
    'settings:particlesEnabled',
    true,
  )
  const [highContrast, setHighContrast] = usePersistentState(
    'settings:highContrast',
    false,
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [guidePageOpen, setGuidePageOpen] = useState(false)
  const [guideTourStep, setGuideTourStep] = useState<GuideTourStep>('welcome')
  const [revisionPlannerOpen, setRevisionPlannerOpen] = useState(false)
  const [friendsPageOpen, setFriendsPageOpen] = useState(false)
  const [isMobileWorkspace, setIsMobileWorkspace] = useState(() =>
    window.matchMedia('(max-width: 859px)').matches,
  )
  const [mobileWorkspacePage, setMobileWorkspacePage] =
    useState<MobileWorkspacePage>('pomodoro')
  const [folderBackgrounds, setFolderBackgrounds] = useState<BackgroundAsset[]>([])
  const [uploadedBackgrounds, setUploadedBackgrounds] = useState<BackgroundAsset[]>(
    [],
  )
  const [uploadError, setUploadError] = useState('')
  const [uploadVersion, setUploadVersion] = useState(0)
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus>(
    DEFAULT_MEMORY_STATUS,
  )
  const [memoryNotice, setMemoryNotice] = useState('')

  useEffect(() => {
    const query = window.matchMedia('(max-width: 859px)')
    const syncMobileWorkspace = () => setIsMobileWorkspace(query.matches)

    syncMobileWorkspace()
    query.addEventListener('change', syncMobileWorkspace)

    return () => query.removeEventListener('change', syncMobileWorkspace)
  }, [])

  useEffect(() => {
    if (languageState !== language) {
      setLanguageState(language)
    }
  }, [language, languageState, setLanguageState])

  useEffect(() => {
    const normalizedStored = normalizeRevisionEvents(revisionEventsState)

    if (JSON.stringify(normalizedStored) !== JSON.stringify(revisionEvents)) {
      setRevisionEvents(revisionEvents)
    }
  }, [revisionEvents, revisionEventsState, setRevisionEvents])

  useEffect(() => {
    const previous = previousStreakRef.current
    const newActiveDay = previous.lastActiveDate !== streak.lastActiveDate
    const streakGrew = streak.current > previous.current

    if (newActiveDay || streakGrew) {
      setStreakIgniteKey(Date.now())
    }

    previousStreakRef.current = streak
  }, [streak])

  useEffect(() => {
    const previous = previousRunRef.current

    if (run.bestRun > previous.bestRun) {
      setBestRunBurstKey(run.lastStarAt || Date.now())
    }

    previousRunRef.current = run
  }, [run])

  useEffect(() => {
    const discovery = discoverFlameEvolution(flameEvolution, {
      streak,
      run,
      todos,
    })
    const currentSerialized = JSON.stringify(flameEvolution)
    const nextSerialized = JSON.stringify(discovery.state)

    if (currentSerialized !== nextSerialized) {
      setFlameEvolutionState(discovery.state)
    }

  }, [
    flameEvolution,
    run,
    setFlameEvolutionState,
    streak,
    todos,
  ])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const canUseCloudStreak = Boolean(
    cloudSync.client &&
      cloudSync.user &&
      cloudSync.status.phase !== 'conflict' &&
      cloudSync.status.phase !== 'offline' &&
      cloudSync.status.phase !== 'error',
  )

  const checkInForToday = useCallback(() => {
    if (canUseCloudStreak && cloudSync.client) {
      void recordCloudDailyCheckIn(cloudSync.client)
        .then(setStreakState)
        .catch(() => {
          setStreakState((current) => recordDailyCheckIn(normalizeStreak(current)))
        })
      return
    }

    setStreakState((current) => recordDailyCheckIn(normalizeStreak(current)))
  }, [canUseCloudStreak, cloudSync.client, setStreakState])

  useEffect(() => {
    checkInForToday()
  }, [checkInForToday, streak.lastActiveDate])

  useEffect(() => {
    let midnightTimeout = 0

    const scheduleMidnightCheckIn = () => {
      window.clearTimeout(midnightTimeout)
      midnightTimeout = window.setTimeout(() => {
        checkInForToday()
        scheduleMidnightCheckIn()
      }, millisecondsUntilNextLocalMidnight())
    }

    const reconcileDailyCheckIn = () => {
      checkInForToday()
      scheduleMidnightCheckIn()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reconcileDailyCheckIn()
      }
    }

    scheduleMidnightCheckIn()
    window.addEventListener('focus', reconcileDailyCheckIn)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearTimeout(midnightTimeout)
      window.removeEventListener('focus', reconcileDailyCheckIn)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [checkInForToday])

  const refreshMemoryStatus = useCallback((restored = false) => {
    void getDurableStorageStatus(restored).then(setMemoryStatus)
  }, [])

  useEffect(() => {
    refreshMemoryStatus()
    const interval = window.setInterval(() => refreshMemoryStatus(), 8000)

    return () => window.clearInterval(interval)
  }, [refreshMemoryStatus])

  useEffect(() => {
    if (layoutVersion < 9) {
      setLayouts(DEFAULT_LAYOUTS)
      setLayoutVersion(CURRENT_LAYOUT_VERSION)
      return
    }

    if (layoutVersion < CURRENT_LAYOUT_VERSION) {
      setLayouts((current) => {
        const merged = mergeDefaultLayouts(current)

        return {
          ...merged,
          youtube: {
            ...DEFAULT_LAYOUTS.youtube,
            visible: merged.youtube.visible,
            z: merged.youtube.z,
          },
        }
      })
      setLayoutVersion(CURRENT_LAYOUT_VERSION)
    }
  }, [layoutVersion, setLayoutVersion, setLayouts])

  useEffect(() => {
    const previous = previousTimerSettingsRef.current
    const changed =
      previous.focusMinutes !== timerSettings.focusMinutes ||
      previous.shortBreakMinutes !== timerSettings.shortBreakMinutes ||
      previous.longBreakMinutes !== timerSettings.longBreakMinutes ||
      previous.longBreakEvery !== timerSettings.longBreakEvery

    previousTimerSettingsRef.current = timerSettings

    if (changed && !timerRunning) {
      setTimerRemaining(timerSeconds(timerMode, timerSettings))
    }
  }, [setTimerRemaining, timerMode, timerRunning, timerSettings])

  useEffect(() => {
    if (!activeTask) {
      if (activeRevisionEvent) {
        setRevisionEvents((current) => {
          let changed = false
          const next = normalizeRevisionEvents(current).map((event) => {
            if (event.id !== activeRevisionEvent.id) {
              return event
            }

            const completedPomodoros = Math.min(
              event.completedPomodoros,
              run.targetPomodoros,
            )

            if (
              event.requiredPomodoros === run.targetPomodoros &&
              event.completedPomodoros === completedPomodoros
            ) {
              return event
            }

            changed = true

            return {
              ...event,
              requiredPomodoros: run.targetPomodoros,
              completedPomodoros,
            }
          })

          return changed ? next : current
        })
      }

      return
    }

    const nextMemory: TaskPomodoroMemory = {
      mode: timerMode,
      remaining: timerRemaining,
      targetPomodoros: run.targetPomodoros,
      completedInTarget: run.completedInTarget,
      currentRun: run.currentRun,
    }

    setTaskPomodoroMemory((current) => {
      const existing = current[activeTask.id]

      if (
        existing?.mode === nextMemory.mode &&
        existing.remaining === nextMemory.remaining &&
        existing.targetPomodoros === nextMemory.targetPomodoros &&
        existing.completedInTarget === nextMemory.completedInTarget &&
        existing.currentRun === nextMemory.currentRun
      ) {
        return current
      }

      return {
        ...current,
        [activeTask.id]: nextMemory,
      }
    })
  }, [
    activeTask,
    activeRevisionEvent,
    run.completedInTarget,
    run.currentRun,
    run.targetPomodoros,
    setRevisionEvents,
    setTaskPomodoroMemory,
    timerMode,
    timerRemaining,
  ])

  useEffect(() => {
    let cancelled = false

    fetch(publicPath('backgrounds/manifest.json'), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (!cancelled) {
          setFolderBackgrounds(normalizeFolderBackgrounds(data))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFolderBackgrounds([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const objectUrls: string[] = []

    listUploadedBackgrounds()
      .then((records) => {
        if (cancelled) {
          return
        }

        const legacySelected = records.find(
          (record) =>
            record.id === selectedBackgroundId &&
            canonicalLegacyBackgroundId(record.label),
        )

        if (legacySelected) {
          setSelectedBackgroundId(
            canonicalLegacyBackgroundId(legacySelected.label),
          )
        }

        const backgrounds = records.flatMap((record) => {
          if (canonicalLegacyBackgroundId(record.label)) {
            return []
          }

          const src = URL.createObjectURL(record.blob)
          objectUrls.push(src)

          return [
            {
              id: record.id,
              label: record.label,
              kind: record.kind,
              src,
              source: 'upload' as const,
            },
          ]
        })

        setUploadedBackgrounds(backgrounds)
      })
      .catch(() => {
        if (!cancelled) {
          setUploadedBackgrounds([])
        }
      })

    return () => {
      cancelled = true
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [selectedBackgroundId, setSelectedBackgroundId, uploadVersion])

  const backgrounds = useMemo(
    () =>
      dedupeBackgrounds([
        ...BUILT_IN_BACKGROUNDS,
        ...folderBackgrounds,
        ...uploadedBackgrounds,
      ]),
    [folderBackgrounds, uploadedBackgrounds],
  )
  const activeBackground =
    backgrounds.find((background) => background.id === selectedBackgroundId) ??
    BUILT_IN_BACKGROUNDS[0]

  const updateLayout = useCallback(
    (layout: WidgetLayout) => {
      const id = layout.id as WidgetId

      setLayouts((current) => ({
        ...mergeDefaultLayouts(current),
        [id]: { ...layout, id },
      }))
    },
    [setLayouts],
  )

  const maxLayoutZ = useCallback(
    (
      fixedLayouts = layouts,
      windowLayouts = taskWindowLayouts,
    ) => Math.max(
      ...WIDGET_ORDER.map((widgetId) => fixedLayouts[widgetId].z),
      ...Object.values(windowLayouts).map((layout) => layout.z),
    ),
    [layouts, taskWindowLayouts],
  )

  const focusWidget = useCallback(
    (id: WidgetId) => {
      setLayouts((current) => {
        const merged = mergeDefaultLayouts(current)
        const maxZ = maxLayoutZ(merged)

        return {
          ...merged,
          [id]: {
            ...merged[id],
            visible: true,
            z: maxZ + 1,
          },
        }
      })
    },
    [maxLayoutZ, setLayouts],
  )

  const toggleWidget = useCallback(
    (id: WidgetId) => {
      setLayouts((current) => {
        const merged = mergeDefaultLayouts(current)
        const nextVisible = !merged[id].visible
        const maxZ = maxLayoutZ(merged)

        return {
          ...merged,
          [id]: {
            ...merged[id],
            visible: nextVisible,
            z: nextVisible ? maxZ + 1 : merged[id].z,
          },
        }
      })
    },
    [maxLayoutZ, setLayouts],
  )

  const hideWidget = useCallback(
    (id: WidgetId) => {
      setLayouts((current) => {
        const merged = mergeDefaultLayouts(current)
        return {
          ...merged,
          [id]: {
            ...merged[id],
            visible: false,
          },
        }
      })
    },
    [setLayouts],
  )

  const updateTaskWindowLayout = useCallback(
    (layout: WidgetLayout) => {
      setTaskWindowLayouts((current) => ({
        ...normalizeTaskWindowLayouts(
          current,
          taskWindows,
          layouts.todo ?? DEFAULT_LAYOUTS.todo,
        ),
        [layout.id]: layout,
      }))
    },
    [layouts.todo, setTaskWindowLayouts, taskWindows],
  )

  const focusTaskWindow = useCallback(
    (id: string) => {
      setTaskWindowLayouts((current) => {
        const merged = normalizeTaskWindowLayouts(
          current,
          taskWindows,
          layouts.todo ?? DEFAULT_LAYOUTS.todo,
        )
        const layout = merged[id]

        if (!layout) {
          return merged
        }

        return {
          ...merged,
          [id]: {
            ...layout,
            visible: true,
            z: maxLayoutZ(layouts, merged) + 1,
          },
        }
      })
    },
    [layouts, maxLayoutZ, setTaskWindowLayouts, taskWindows],
  )

  const toggleTaskWindow = useCallback(
    (id: string) => {
      setTaskWindowLayouts((current) => {
        const merged = normalizeTaskWindowLayouts(
          current,
          taskWindows,
          layouts.todo ?? DEFAULT_LAYOUTS.todo,
        )
        const layout = merged[id]

        if (!layout) {
          return merged
        }

        const nextVisible = !layout.visible

        return {
          ...merged,
          [id]: {
            ...layout,
            visible: nextVisible,
            z: nextVisible ? maxLayoutZ(layouts, merged) + 1 : layout.z,
          },
        }
      })
    },
    [layouts, maxLayoutZ, setTaskWindowLayouts, taskWindows],
  )

  const hideTaskWindow = useCallback(
    (id: string) => {
      setTaskWindowLayouts((current) => {
        const merged = normalizeTaskWindowLayouts(
          current,
          taskWindows,
          layouts.todo ?? DEFAULT_LAYOUTS.todo,
        )
        const layout = merged[id]

        if (!layout) {
          return merged
        }

        return {
          ...merged,
          [id]: {
            ...layout,
            visible: false,
          },
        }
      })
    },
    [layouts.todo, setTaskWindowLayouts, taskWindows],
  )

  const closeRevisionPlanner = useCallback(() => {
    setRevisionPlannerOpen(false)
    setMobileWorkspacePage((current) => (current === 'planner' ? null : current))
  }, [])

  const closeFriendsPage = useCallback(() => {
    setFriendsPageOpen(false)
    setMobileWorkspacePage((current) => (current === 'friends' ? null : current))
  }, [])

  const closeGuidePage = useCallback(() => {
    setGuidePageOpen(false)
    setGuideTourStep('welcome')
    setMobileWorkspacePage((current) => (current === 'guide' ? null : current))
  }, [])

  const handleDockWidgetToggle = useCallback(
    (id: WidgetId) => {
      if (isMobileWorkspace) {
        if (mobileWorkspacePage === id && layouts[id].visible) {
          hideWidget(id)
          setMobileWorkspacePage(null)
          return
        }

        setMobileWorkspacePage(id)
        setRevisionPlannerOpen(false)
        setFriendsPageOpen(false)
        focusWidget(id)
        return
      }

      if (layouts[id].visible) {
        hideWidget(id)
        return
      }

      focusWidget(id)
    },
    [
      focusWidget,
      hideWidget,
      isMobileWorkspace,
      layouts,
      mobileWorkspacePage,
    ],
  )

  const handleDockTaskWindowToggle = useCallback(
    (id: string) => {
      const page = taskMobilePage(id)
      const layout = taskWindowLayouts[id]

      if (isMobileWorkspace) {
        if (mobileWorkspacePage === page && layout?.visible) {
          hideTaskWindow(id)
          setMobileWorkspacePage(null)
          return
        }

        setMobileWorkspacePage(page)
        setRevisionPlannerOpen(false)
        setFriendsPageOpen(false)
        focusTaskWindow(id)
        return
      }

      if (layout?.visible) {
        hideTaskWindow(id)
        return
      }

      focusTaskWindow(id)
    },
    [
      focusTaskWindow,
      hideTaskWindow,
      isMobileWorkspace,
      mobileWorkspacePage,
      taskWindowLayouts,
    ],
  )

  const handleRevisionPlannerDockToggle = useCallback(() => {
    if (isMobileWorkspace) {
      if (revisionPlannerOpen && mobileWorkspacePage === 'planner') {
        closeRevisionPlanner()
        return
      }

      setMobileWorkspacePage('planner')
      setFriendsPageOpen(false)
      setRevisionPlannerOpen(true)
      return
    }

    if (revisionPlannerOpen) {
      setRevisionPlannerOpen(false)
      return
    }

    setFriendsPageOpen(false)
    setRevisionPlannerOpen(true)
  }, [
    closeRevisionPlanner,
    isMobileWorkspace,
    mobileWorkspacePage,
    revisionPlannerOpen,
  ])

  const handleFriendsPageDockToggle = useCallback(() => {
    if (isMobileWorkspace) {
      if (friendsPageOpen && mobileWorkspacePage === 'friends') {
        closeFriendsPage()
        return
      }

      setMobileWorkspacePage('friends')
      setRevisionPlannerOpen(false)
      setFriendsPageOpen(true)
      return
    }

    if (friendsPageOpen) {
      setFriendsPageOpen(false)
      return
    }

    setRevisionPlannerOpen(false)
    setFriendsPageOpen(true)
  }, [closeFriendsPage, friendsPageOpen, isMobileWorkspace, mobileWorkspacePage])

  const handleGuidePageDockToggle = useCallback(() => {
    if (isMobileWorkspace) {
      if (guidePageOpen) {
        closeGuidePage()
        return
      }

      setRevisionPlannerOpen(false)
      setFriendsPageOpen(false)
      setGuidePageOpen(true)
      return
    }

    if (guidePageOpen) {
      setGuidePageOpen(false)
      return
    }

    setRevisionPlannerOpen(false)
    setFriendsPageOpen(false)
    setGuidePageOpen(true)
  }, [closeGuidePage, guidePageOpen, isMobileWorkspace])

  const prepareGuideStep = useCallback(
    (step: GuideTourStep) => {
      setGuideTourStep(step)
      if (step === 'welcome' || step === 'complete') {
        return
      }

      const keepsPlannerOpen =
        step === 'course-open' ||
        step === 'course-name' ||
        step === 'course-basics' ||
        step === 'course-details' ||
        step === 'course-create' ||
        step === 'course-delete'

      setSettingsOpen(false)
      setRevisionPlannerOpen(keepsPlannerOpen)
      setFriendsPageOpen(false)

      if (step === 'pomodoro') {
        setMobileWorkspacePage('pomodoro')
        focusWidget('pomodoro')
        return
      }

      if (step === 'tasks') {
        const firstTaskWindow = displayedTaskWindows[0]

        if (firstTaskWindow) {
          setMobileWorkspacePage(taskMobilePage(firstTaskWindow.id))
          focusTaskWindow(firstTaskWindow.id)
        }
        return
      }

      if (step === 'revisions') {
        setMobileWorkspacePage(null)
        return
      }

      if (keepsPlannerOpen) {
        setMobileWorkspacePage(isMobileWorkspace ? 'planner' : null)
        return
      }

      if (step === 'backgrounds') {
        setMobileWorkspacePage(null)
        hideWidget('backgrounds')
        return
      }

      if (step === 'background-select') {
        setMobileWorkspacePage('backgrounds')
        focusWidget('backgrounds')
        return
      }

      if (step === 'youtube') {
        setMobileWorkspacePage(null)
        hideWidget('youtube')
        return
      }

      if (step === 'youtube-url' || step === 'youtube-watched') {
        setMobileWorkspacePage('youtube')
        focusWidget('youtube')
        return
      }

      setMobileWorkspacePage(null)
    },
    [
      displayedTaskWindows,
      focusTaskWindow,
      focusWidget,
      hideWidget,
      isMobileWorkspace,
    ],
  )

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) {
      return
    }

    setUploadError('')
    const uploadableFiles = Array.from(files).filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
    )

    if (!uploadableFiles.length) {
      setUploadError(copy.backgrounds.unsupported)
      return
    }

    try {
      const saved = await Promise.all(uploadableFiles.map(saveUploadedBackground))
      setUploadVersion((version) => version + 1)

      if (saved[0]) {
        setSelectedBackgroundId(saved[0].id)
      }
    } catch {
      setUploadError(copy.backgrounds.uploadFailed)
    }
  }

  const handleDeleteUpload = async (id: string) => {
    try {
      await deleteUploadedBackground(id)
      setUploadVersion((version) => version + 1)

      if (selectedBackgroundId === id) {
        setSelectedBackgroundId('train')
      }
    } catch {
      setUploadError(copy.backgrounds.deleteFailed)
    }
  }

  const recordActivity = useCallback(() => {
    if (canUseCloudStreak && cloudSync.client) {
      void recordCloudStreakActivity(cloudSync.client)
        .then(setStreakState)
        .catch(() => {
          setStreakState((current) => recordStreakActivity(normalizeStreak(current)))
        })
      return
    }

    setStreakState((current) => recordStreakActivity(normalizeStreak(current)))
  }, [canUseCloudStreak, cloudSync.client, setStreakState])

  const playStreakUnlockCue = useCallback(
    (cue: Partial<Omit<StreakUnlockCue, 'key'>> = {}) => {
      setStreakUnlockCue({
        key: Date.now(),
        date: cue.date ?? todayKey(),
        taskLabel: cue.taskLabel,
        subtitle: cue.subtitle,
      })
    },
    [],
  )

  const triggerTaskUnlock = useCallback((taskLabel?: string) => {
    const today = todayKey()
    let lastUnlockDate = lastTaskUnlockDateRef.current

    try {
      lastUnlockDate =
        window.localStorage.getItem(STREAK_TASK_UNLOCK_KEY) ?? lastUnlockDate
    } catch {
      // Keep the visual lock in memory when localStorage is unavailable.
    }

    if (lastUnlockDate === today) {
      return
    }

    lastTaskUnlockDateRef.current = today

    try {
      window.localStorage.setItem(STREAK_TASK_UNLOCK_KEY, today)
    } catch {
      // Non-critical UI cue; streak data remains the source of truth.
    }

    playStreakUnlockCue({ date: today, taskLabel })
  }, [playStreakUnlockCue])

  const completeRevisionEvent = useCallback(
    (eventId: string, timeSpentSeconds = 0) => {
      const completedAt = Date.now()

      setRevisionEvents((current) =>
        normalizeRevisionEvents(current).map((event) =>
          event.id === eventId
            ? {
                ...event,
                status: 'done',
                completedPomodoros: event.requiredPomodoros,
                completedAt: event.completedAt ?? completedAt,
                timeSpentSeconds: Math.max(
                  event.timeSpentSeconds,
                  timeSpentSeconds,
                ),
              }
            : event,
        ),
      )
    },
    [setRevisionEvents],
  )

  const commitTodos = useCallback(
    (nextTodos: TodoItem[], recordManualCompletion = false) => {
      const normalized = normalizeTodos(nextTodos)
      const completedTasks = normalized.filter((todo) => {
        const before = todos.find((item) => item.id === todo.id)
        return before && !before.completed && todo.completed
      })

      if (recordManualCompletion) {
        const completedTask = completedTasks[0]

        if (completedTask) {
          recordActivity()
          triggerTaskUnlock(completedTask.text)
        }
      }

      completedTasks.forEach((task) => {
        if (task.revisionEventId) {
          completeRevisionEvent(task.revisionEventId)
        }
      })

      setTodos(normalized)
    },
    [completeRevisionEvent, recordActivity, setTodos, todos, triggerTaskUnlock],
  )

  const updateDailyGoal = (value: number) => {
    setStreakState((current) => setStreakDailyGoal(normalizeStreak(current), value))

    if (canUseCloudStreak && cloudSync.client) {
      void setCloudStreakDailyGoal(cloudSync.client, value).then(setStreakState)
    }
  }

  const addTemporaryStreakDay = () => {
    if (cloudSync.user) {
      setStreakIgniteKey(Date.now())
      playStreakUnlockCue({ subtitle: copy.streak.unlockSimulated })
      setSettingsOpen(false)
      return
    }

    setStreakState((current) => addSimulatedStreakDay(normalizeStreak(current)))
    setStreakIgniteKey(Date.now())
    playStreakUnlockCue({ subtitle: copy.streak.unlockSimulated })
    setSettingsOpen(false)
  }

  const updateFlameQuestEffect = (effect: FlameQuestEffect | null) => {
    setFlameEvolutionState((current) =>
      selectFlameQuestEffect(normalizeFlameEvolution(current), effect),
    )
  }

  const claimFlameEvolution = (cue: FlameEvolutionUnlockCue) => {
    if (cue.preview) {
      setFlameEvolutionPreviewCue(null)
      return
    }

    setFlameEvolutionState((current) =>
      claimFlameEvolutionUnlocks(
        normalizeFlameEvolution(current),
        cue.claimKeys,
      ),
    )
    setFlameEvolutionPreviewCue(null)
  }

  const revealFlameHint = (key: FlameUnlockKey) => {
    setFlameEvolutionState((current) =>
      revealFlameAchievementHint(normalizeFlameEvolution(current), key),
    )
  }

  const updateTimerSetting = (key: keyof TimerSettings, value: number) => {
    const nextSettings = normalizeTimerSettings({
      ...timerSettings,
      [key]: value,
    })
    const affectedMode =
      (key === 'focusMinutes' && timerMode === 'focus') ||
      (key === 'shortBreakMinutes' && timerMode === 'shortBreak') ||
      (key === 'longBreakMinutes' && timerMode === 'longBreak')

    setTimerSettings(nextSettings)

    if (!affectedMode) {
      return
    }

    const nextRemaining = timerSeconds(timerMode, nextSettings)
    setTimerRemaining(nextRemaining)

    if (!activeTask) {
      return
    }

    setTaskPomodoroMemory((current) => ({
      ...current,
      [activeTask.id]: {
        ...syncTaskPomodoroMemory(
          activeTask,
          nextSettings,
          current[activeTask.id],
        ),
        mode: timerMode,
        remaining: nextRemaining,
      },
    }))
  }

  const resetLayout = () => {
    setLayouts(DEFAULT_LAYOUTS)
    setTaskWindowLayouts(
      normalizeTaskWindowLayouts({}, taskWindows, DEFAULT_LAYOUTS.todo),
    )
    setLayoutVersion(CURRENT_LAYOUT_VERSION)
  }

  const exportData = async () => {
    try {
      const snapshot = await buildDurableSnapshot()
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `muslim-study-place-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setMemoryNotice('')
      refreshMemoryStatus()
    } catch {
      setMemoryNotice(copy.settings.exportFailed)
    }
  }

  const importData = async (file: File | null) => {
    if (!file) {
      return
    }

    try {
      const payload = JSON.parse(await file.text())
      await importDurableSnapshot(payload)
      refreshMemoryStatus(true)
      window.location.reload()
    } catch {
      setMemoryNotice(copy.settings.importFailed)
    }
  }

  const addTaskWindow = () => {
    const now = Date.now()
    const id = `task-window-${now}`
    const title = copy.todo.newWindowTitle(taskWindows.length + 1)
    const emoji = taskWindowEmojiForIndex(taskWindows.length)
    const rank = taskWindows.length
      ? Math.max(...taskWindows.map((window) => window.rank)) + 1
      : 1

    setTaskWindows((current) =>
      normalizeTaskWindows([
        ...current,
        {
          id,
          title,
          emoji,
          rank,
          createdAt: now,
          updatedAt: now,
          deletable: true,
        },
      ]),
    )
    setTaskWindowLayouts((current) => {
      const nextWindows = normalizeTaskWindows([
        ...taskWindows,
        {
          id,
          title,
          emoji,
          rank,
          createdAt: now,
          updatedAt: now,
          deletable: true,
        },
      ])
      const normalized = normalizeTaskWindowLayouts(
        current,
        nextWindows,
        layouts.todo ?? DEFAULT_LAYOUTS.todo,
      )

      return {
        ...normalized,
        [id]: {
          ...normalized[id],
          visible: true,
          z: maxLayoutZ(layouts, normalized) + 1,
        },
      }
    })
    setGuidePageOpen(false)
    setRevisionPlannerOpen(false)
    setFriendsPageOpen(false)
    setMobileWorkspacePage(taskMobilePage(id))
  }

  const renameTaskWindow = (id: string, title: string) => {
    const trimmed = title.trim()

    if (!trimmed) {
      return
    }

    setTaskWindows((current) =>
      normalizeTaskWindows(current).map((window) =>
        window.id === id
          ? { ...window, title: trimmed, updatedAt: Date.now() }
          : window,
      ),
    )
  }

  const changeTaskWindowEmoji = (id: string, emoji: string) => {
    setTaskWindows((current) =>
      normalizeTaskWindows(current).map((window) =>
        window.id === id
          ? { ...window, emoji: emoji.trim(), updatedAt: Date.now() }
          : window,
      ),
    )
  }

  const deleteTaskWindow = (id: string) => {
    const window = displayedTaskWindows.find((item) => item.id === id)

    if (!window?.deletable) {
      return
    }

    if (!globalThis.confirm(copy.todo.deleteWindowConfirm(window.title))) {
      return
    }

    const taskIds = todos
      .filter((todo) => (todo.windowId ?? DEFAULT_TASK_WINDOW_ID) === id)
      .map((todo) => todo.id)

    if (taskIds.length) {
      deleteTasks(taskIds)
    }

    setTaskWindows((current) =>
      normalizeTaskWindows(current).filter((item) => item.id !== id),
    )
    setTaskWindowLayouts((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const nextManualRank = useCallback((windowId = DEFAULT_TASK_WINDOW_ID, fallback = 0) => {
    const ranks = todos
      .filter(
        (todo) =>
          !todo.completed &&
          (todo.windowId ?? DEFAULT_TASK_WINDOW_ID) === windowId,
      )
      .map((todo) => todo.rank)

    return ranks.length ? Math.min(...ranks) - 1 : fallback
  }, [todos])

  const addTask = (
    windowId: string,
    text: string,
    requiredPomodoros: number,
    priority: TodoPriority,
    difficulty: TodoDifficulty,
  ) => {
    const now = new Date().getTime()
    const normalizedPriority = normalizePriority(priority)
    const normalizedDifficulty = normalizeDifficulty(difficulty)
    const taskWindowId = taskWindows.some((window) => window.id === windowId)
      ? windowId
      : DEFAULT_TASK_WINDOW_ID
    const newTodo: TodoItem = {
      id: `todo-${now}`,
      windowId: taskWindowId,
      text,
      priority: normalizedPriority,
      difficulty: normalizedDifficulty,
      rank: nextManualRank(taskWindowId, now),
      completed: false,
      active: !todos.some((todo) => todo.active && !todo.completed),
      requiredPomodoros: clampPomodoros(requiredPomodoros),
      completedPomodoros: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      repeatIndex: 0,
    }
    const memory = createTaskPomodoroMemory(newTodo, timerSettings)

    setTaskPomodoroMemory((current) => ({
      ...current,
      [newTodo.id]: memory,
    }))
    commitTodos([newTodo, ...todos])

    if (newTodo.active) {
      setPomodoroRun((current) => ({
        ...current,
        targetPomodoros: memory.targetPomodoros,
        completedInTarget: 0,
        currentRun: 0,
      }))
      setTimerMode('focus')
      setTimerRemaining(memory.remaining)
      setTimerRunning(false)
    }
  }

  const updateTask = (
    taskId: string,
    patch: Partial<
      Pick<TodoItem, 'text' | 'priority' | 'difficulty' | 'requiredPomodoros'>
    >,
  ) => {
    commitTodos(
      todos.map((todo) => {
        if (todo.id !== taskId) {
          return todo
        }

        const requiredPomodoros =
          patch.requiredPomodoros === undefined
            ? todo.requiredPomodoros
            : clampPomodoros(patch.requiredPomodoros)
        const completedPomodoros = Math.min(
          todo.completedPomodoros,
          requiredPomodoros,
        )
        const completed = todo.completed || completedPomodoros >= requiredPomodoros
        const text = typeof patch.text === 'string' && patch.text.trim()
          ? patch.text.trim()
          : todo.text

        return {
          ...todo,
          text,
          priority:
            patch.priority === undefined
              ? todo.priority
              : normalizePriority(patch.priority),
          difficulty:
            patch.difficulty === undefined
              ? todo.difficulty
              : normalizeDifficulty(patch.difficulty),
          requiredPomodoros,
          completedPomodoros,
          completed,
          active: completed ? false : todo.active,
          updatedAt: Date.now(),
          completedAt: completed ? todo.completedAt ?? Date.now() : null,
        }
      }),
    )
  }

  const reorderTask = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return
    }

    const sourceTodo = todos.find((todo) => todo.id === sourceId)

    if (!sourceTodo) {
      return
    }

    const sourceWindowId = sourceTodo.windowId ?? DEFAULT_TASK_WINDOW_ID
    const ordered = filterAndSortTodos(
      todos.filter((todo) => (todo.windowId ?? DEFAULT_TASK_WINDOW_ID) === sourceWindowId),
      'active',
      '',
      'manual',
    )
    const sourceIndex = ordered.findIndex((todo) => todo.id === sourceId)
    const targetIndex = ordered.findIndex((todo) => todo.id === targetId)

    if (sourceIndex === -1 || targetIndex === -1) {
      return
    }

    const nextOrdered = [...ordered]
    const [source] = nextOrdered.splice(sourceIndex, 1)
    nextOrdered.splice(targetIndex, 0, source)

    const rankById = new Map(
      nextOrdered.map((todo, index) => [todo.id, index + 1]),
    )
    const now = new Date().getTime()

    commitTodos(
      todos.map((todo) => {
        const rank = rankById.get(todo.id)

        if (rank !== undefined) {
          return { ...todo, rank, updatedAt: now }
        }

        return todo
      }),
    )
  }

  const repeatTask = (taskId: string) => {
    const task = todos.find((todo) => todo.id === taskId)

    if (!task) {
      return
    }

    const rootId = todoRootId(task)

    if (hasOpenTodoForRoot(todos, rootId)) {
      return
    }

    const repeatIndex =
      Math.max(
        task.repeatIndex,
        ...todos
          .filter((todo) => todo.id === rootId || todo.repeatOf === rootId)
          .map((todo) => todo.repeatIndex),
      ) + 1
    const now = Date.now()
    const taskWindowId = task.windowId ?? DEFAULT_TASK_WINDOW_ID
    const newTodo: TodoItem = {
      id: `todo-${now}-${repeatIndex}`,
      windowId: taskWindowId,
      text: task.text,
      priority: task.priority,
      difficulty: task.difficulty,
      rank: nextManualRank(taskWindowId, now),
      completed: false,
      active: !todos.some((todo) => todo.active && !todo.completed),
      requiredPomodoros: task.requiredPomodoros,
      completedPomodoros: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      repeatOf: rootId,
      repeatIndex,
    }
    const memory = createTaskPomodoroMemory(newTodo, timerSettings)

    setTaskPomodoroMemory((current) => ({
      ...current,
      [newTodo.id]: memory,
    }))
    commitTodos([newTodo, ...todos])

    if (newTodo.active) {
      setPomodoroRun((current) => ({
        ...current,
        targetPomodoros: memory.targetPomodoros,
        completedInTarget: 0,
        currentRun: 0,
      }))
      setTimerMode('focus')
      setTimerRemaining(memory.remaining)
      setTimerRunning(false)
    }
  }

  const activateTask = useCallback((taskId: string, start = false) => {
    const task = todos.find((todo) => todo.id === taskId)

    if (!task || task.completed) {
      return false
    }

    if (activeTask && activeTask.id !== taskId) {
      setTaskPomodoroMemory((current) => ({
        ...current,
        [activeTask.id]: {
          mode: timerMode,
          remaining: timerRemaining,
          targetPomodoros: run.targetPomodoros,
          completedInTarget: run.completedInTarget,
          currentRun: run.currentRun,
        },
      }))
    }

    setRevisionEvents((current) =>
      normalizeRevisionEvents(current).map((event) =>
        event.status === 'active' && event.completedPomodoros < event.requiredPomodoros
          ? { ...event, status: 'pending' }
          : event,
      ),
    )

    const storedMemory = taskPomodoroMemory[taskId]
    const memory =
      !storedMemory && task.completedPomodoros === 0
        ? createTaskPomodoroMemory(task, timerSettings)
        : syncTaskPomodoroMemory(task, timerSettings, storedMemory)

    commitTodos(
      todos.map((todo) => ({
        ...todo,
        active: todo.id === taskId,
      })),
    )
    setPomodoroRun((current) => ({
      ...current,
      targetPomodoros: memory.targetPomodoros,
      completedInTarget: memory.completedInTarget,
      currentRun: memory.currentRun,
    }))
    setTimerMode(memory.mode)
    setTimerRemaining(memory.remaining)
    setTimerRunning(start)

    return true
  }, [
    activeTask,
    commitTodos,
    run.completedInTarget,
    run.currentRun,
    run.targetPomodoros,
    setPomodoroRun,
    setTaskPomodoroMemory,
    setTimerMode,
    setTimerRemaining,
    setTimerRunning,
    setRevisionEvents,
    taskPomodoroMemory,
    timerMode,
    timerRemaining,
    timerSettings,
    todos,
  ])

  const setTaskActive = (taskId: string) => {
    const activated = activateTask(taskId)

    if (!activated) {
      return
    }

    setTimerRunning(false)
  }

  const startTaskTimer = (taskId: string) => {
    const task = todos.find((todo) => todo.id === taskId)

    if (!task || task.completed) {
      return
    }

    activateTask(taskId, true)
  }

  const pauseTaskTimer = (taskId: string) => {
    if (activeTask?.id !== taskId) {
      return
    }

    setTimerRunning(false)
  }

  const startFreeFocus = useCallback(() => {
    if (activeTask) {
      setTaskPomodoroMemory((current) => ({
        ...current,
        [activeTask.id]: {
          mode: timerMode,
          remaining: timerRemaining,
          targetPomodoros: run.targetPomodoros,
          completedInTarget: run.completedInTarget,
          currentRun: run.currentRun,
        },
      }))
    }

    commitTodos(
      todos.map((todo) => ({
        ...todo,
        active: false,
      })),
    )
    setRevisionEvents((current) =>
      normalizeRevisionEvents(current).map((event) =>
        event.status === 'active' && event.completedPomodoros < event.requiredPomodoros
          ? { ...event, status: 'pending' }
          : event,
      ),
    )
    const freeTarget = clampPomodoros(pomodoroRun.targetPomodoros)

    setPomodoroRun((current) => ({
      ...current,
      targetPomodoros: freeTarget,
      completedInTarget: 0,
      currentRun: 0,
    }))
    setTimerMode('focus')
    setTimerRemaining(timerSeconds('focus', timerSettings))
    setTimerRunning(true)
  }, [
    activeTask,
    commitTodos,
    pomodoroRun.targetPomodoros,
    run.completedInTarget,
    run.currentRun,
    run.targetPomodoros,
    setPomodoroRun,
    setRevisionEvents,
    setTaskPomodoroMemory,
    setTimerMode,
    setTimerRemaining,
    setTimerRunning,
    timerMode,
    timerRemaining,
    timerSettings,
    todos,
  ])

  const updateTaskPomodoro = useCallback((
    taskId: string,
    delta: number,
    recordCompletion = true,
  ) => {
    commitTodos(
      todos.map((todo) => {
        if (todo.id !== taskId) {
          return todo
        }

        const nextCompletedPomodoros = Math.min(
          Math.max(todo.completedPomodoros + delta, 0),
          todo.requiredPomodoros,
        )
        const completed =
          delta > 0
            ? todo.completed || nextCompletedPomodoros >= todo.requiredPomodoros
            : false

        return {
          ...todo,
          completed,
          active: completed ? false : todo.active,
          completedPomodoros: nextCompletedPomodoros,
          updatedAt: Date.now(),
          completedAt: completed ? todo.completedAt ?? Date.now() : null,
        }
      }),
      recordCompletion,
    )
  }, [commitTodos, todos])

  const changePomodoroRun = useCallback((
    value:
      | PomodoroRunState
      | ((current: PomodoroRunState) => PomodoroRunState),
  ) => {
    const nextRun = normalizePomodoroRun(
      typeof value === 'function' ? value(run) : value,
    )

    setPomodoroRun((current) =>
      normalizePomodoroRun({
        ...normalizePomodoroRun(current),
        ...nextRun,
      }),
    )

    if (!activeTask) {
      return
    }

    setTaskPomodoroMemory((current) => {
      const existing =
        current[activeTask.id] ?? createTaskPomodoroMemory(activeTask, timerSettings)

      return {
        ...current,
        [activeTask.id]: {
          ...existing,
          mode: timerMode,
          remaining: timerRemaining,
          targetPomodoros: nextRun.targetPomodoros,
          completedInTarget: nextRun.completedInTarget,
          currentRun: nextRun.currentRun,
        },
      }
    })
  }, [
    activeTask,
    run,
    setPomodoroRun,
    setTaskPomodoroMemory,
    timerMode,
    timerRemaining,
    timerSettings,
  ])

  const updatePomodoroTarget = useCallback((targetPomodoros: number) => {
    const nextTarget = clampPomodoros(targetPomodoros)

    changePomodoroRun({
      ...run,
      targetPomodoros: nextTarget,
      completedInTarget: Math.min(run.completedInTarget, nextTarget),
    })

    if (!activeTask) {
      if (activeRevisionEvent) {
        setRevisionEvents((current) =>
          normalizeRevisionEvents(current).map((event) =>
            event.id === activeRevisionEvent.id
              ? {
                  ...event,
                  requiredPomodoros: Math.max(nextTarget, event.completedPomodoros),
                }
              : event,
          ),
        )
      }

      return
    }

    const nextRequired = Math.max(nextTarget, activeTask.completedPomodoros)

    commitTodos(
      todos.map((todo) => {
        if (todo.id !== activeTask.id) {
          return todo
        }

        return {
          ...todo,
          requiredPomodoros: nextRequired,
          completed: todo.completedPomodoros >= nextRequired,
          updatedAt: Date.now(),
          completedAt:
            todo.completedPomodoros >= nextRequired
              ? todo.completedAt ?? Date.now()
              : null,
        }
      }),
    )
  }, [activeRevisionEvent, activeTask, changePomodoroRun, commitTodos, run, setRevisionEvents, todos])

  const toggleTask = (taskId: string) => {
    commitTodos(
      todos.map((todo) => {
        if (todo.id !== taskId) {
          return todo
        }

        const completed = !todo.completed

        return {
          ...todo,
          completed,
          active: completed ? false : todo.active,
          completedPomodoros: completed
            ? todo.requiredPomodoros
            : Math.min(todo.completedPomodoros, todo.requiredPomodoros - 1),
          updatedAt: Date.now(),
          completedAt: completed ? Date.now() : null,
        }
      }),
      true,
    )
  }

  const deleteTasks = useCallback((taskIds: string[]) => {
    const ids = new Set(taskIds)

    if (!ids.size) {
      return
    }

    const deletedLinkedEventIds = todos.flatMap((todo) =>
      ids.has(todo.id) && todo.revisionEventId ? [todo.revisionEventId] : [],
    )

    const remaining = todos.filter((todo) => !ids.has(todo.id))
    const activeExists = remaining.some((todo) => todo.active && !todo.completed)

    setTaskPomodoroMemory((current) => {
      const next = { ...current }
      ids.forEach((id) => {
        delete next[id]
      })
      return next
    })

    commitTodos(
      activeExists || remaining.length === 0
        ? remaining
        : (() => {
            const nextActiveId = filterAndSortTodos(
              remaining,
              'active',
              '',
              'manual',
            )[0]?.id

            return nextActiveId
              ? remaining.map((todo) => ({
                  ...todo,
                  active: todo.id === nextActiveId && !todo.completed,
                }))
              : remaining
          })(),
    )

    if (deletedLinkedEventIds.length) {
      const linkedIds = new Set(deletedLinkedEventIds)

      setRevisionEvents((current) =>
        normalizeRevisionEvents(current).map((event) =>
          linkedIds.has(event.id) && event.status !== 'done'
            ? {
                ...event,
                status: 'pending',
                linkedTodoId: undefined,
              }
            : event,
        ),
      )
    }
  }, [commitTodos, setRevisionEvents, setTaskPomodoroMemory, todos])

  const deleteTask = (taskId: string) => {
    deleteTasks([taskId])
  }

  const saveRevisionCourse = useCallback(
    (course: RevisionCourse) => {
      const nextCourses = normalizeRevisionCourses([
        ...revisionCourses.filter((item) => item.id !== course.id),
        course,
      ])

      setRevisionCourses(nextCourses)
      setRevisionEvents((current) =>
        buildRevisionEventsForCourses(
          nextCourses,
          revisionMethods,
          normalizeRevisionEvents(current),
        ),
      )
      window.dispatchEvent(new CustomEvent('msp:guide-action', {
        detail: { action: 'revision-course-saved', id: course.id },
      }))
    },
    [
      revisionCourses,
      revisionMethods,
      setRevisionCourses,
      setRevisionEvents,
    ],
  )

  const deleteRevisionCourse = (courseId: string) => {
    const linkedTaskIds = revisionEvents.flatMap((event) =>
      event.courseId === courseId && event.linkedTodoId
        ? [event.linkedTodoId]
        : [],
    )

    setRevisionCourses((current) =>
      normalizeRevisionCourses(current).filter((course) => course.id !== courseId),
    )
    setRevisionEvents((current) =>
      normalizeRevisionEvents(current).filter((event) => event.courseId !== courseId),
    )

    if (linkedTaskIds.length) {
      deleteTasks(linkedTaskIds)
    }
    window.dispatchEvent(new CustomEvent('msp:guide-action', {
      detail: { action: 'revision-course-deleted', id: courseId },
    }))
  }

  const saveRevisionSubject = useCallback(
    (subject: RevisionSubject) => {
      setRevisionSubjects((current) =>
        normalizeRevisionSubjects([...current.filter((item) => item.id !== subject.id), subject]),
      )
    },
    [setRevisionSubjects],
  )

  const deleteRevisionSubject = useCallback(
    (subjectId: string) => {
      setRevisionSubjects((current) =>
        normalizeRevisionSubjects(current).filter((subject) => subject.id !== subjectId),
      )
      setRevisionCourses((current) =>
        normalizeRevisionCourses(current).map((course) =>
          course.subjectId === subjectId
            ? { ...course, subjectId: null, updatedAt: Date.now() }
            : course,
        ),
      )
    },
    [setRevisionCourses, setRevisionSubjects],
  )

  const selectBackground = useCallback((id: string) => {
    setSelectedBackgroundId(id)
    window.dispatchEvent(new CustomEvent('msp:guide-action', {
      detail: { action: 'background-selected', id },
    }))
  }, [setSelectedBackgroundId])

  const deleteRevisionEvent = (eventId: string) => {
    const event = revisionEvents.find((item) => item.id === eventId)

    setRevisionEvents((current) =>
      normalizeRevisionEvents(current).filter((item) => item.id !== eventId),
    )

    if (event?.linkedTodoId) {
      deleteTasks([event.linkedTodoId])
    }
  }

  const saveRevisionMethod = useCallback(
    (method: RevisionMethod) => {
      const customMethods = revisionMethods.filter(
        (item) => !item.builtIn && item.id !== method.id,
      )
      const nextMethods = normalizeRevisionMethods([...customMethods, method])

      setRevisionMethods(nextMethods)
      setRevisionEvents((current) =>
        buildRevisionEventsForCourses(
          revisionCourses,
          nextMethods,
          normalizeRevisionEvents(current),
        ),
      )
    },
    [
      revisionCourses,
      revisionMethods,
      setRevisionEvents,
      setRevisionMethods,
    ],
  )

  const deleteRevisionMethod = useCallback(
    (methodId: string) => {
      const nextMethods = normalizeRevisionMethods(
        revisionMethods.filter((method) => !method.builtIn && method.id !== methodId),
      )
      const nextCourses = revisionCourses.map((course) =>
        course.methodId === methodId
          ? { ...course, methodId: null, updatedAt: Date.now() }
          : course,
      )

      setRevisionMethods(nextMethods)
      setRevisionCourses(nextCourses)
      setRevisionEvents((current) =>
        buildRevisionEventsForCourses(
          nextCourses,
          nextMethods,
          normalizeRevisionEvents(current),
        ),
      )
    },
    [
      revisionCourses,
      revisionMethods,
      setRevisionCourses,
      setRevisionEvents,
      setRevisionMethods,
    ],
  )

  const updateRevisionEvent = useCallback(
    (
      eventId: string,
      patch: Partial<
        Pick<
          RevisionEvent,
          'priority' | 'difficulty' | 'requiredPomodoros' | 'completedPomodoros'
        >
      >,
    ) => {
      setRevisionEvents((current) =>
        normalizeRevisionEvents(current).map((event) => {
          if (event.id !== eventId) {
            return event
          }

          const requiredPomodoros =
            patch.requiredPomodoros === undefined
              ? event.requiredPomodoros
              : clampPomodoros(patch.requiredPomodoros)
          const completedPomodoros = Math.min(
            Math.max(
              patch.completedPomodoros === undefined
                ? event.completedPomodoros
                : patch.completedPomodoros,
              0,
            ),
            requiredPomodoros,
          )
          const completed = completedPomodoros >= requiredPomodoros

          return {
            ...event,
            ...patch,
            requiredPomodoros,
            completedPomodoros,
            status: completed ? 'done' : event.status === 'done' ? 'pending' : event.status,
            completedAt: completed ? event.completedAt ?? Date.now() : null,
          }
        }),
      )
    },
    [setRevisionEvents],
  )

  const rescheduleRevisionEvent = useCallback(
    (eventId: string, scheduledDate: string, scheduledTime: string | null) => {
      setRevisionEvents((current) =>
        normalizeRevisionEvents(current).map((event) =>
          event.id === eventId
            ? {
                ...event,
                scheduledDate,
                scheduledTime,
              }
            : event,
        ),
      )
    },
    [setRevisionEvents],
  )

  const startRevisionEvent = useCallback(
    (eventId: string) => {
      const event = revisionEvents.find((item) => item.id === eventId)

      if (!event || event.status === 'done') {
        return
      }

      const sameActiveRevision = activeRevisionEvent?.id === event.id

      if (activeTask) {
        setTaskPomodoroMemory((current) => ({
          ...current,
          [activeTask.id]: {
            mode: timerMode,
            remaining: timerRemaining,
            targetPomodoros: run.targetPomodoros,
            completedInTarget: run.completedInTarget,
            currentRun: run.currentRun,
          },
        }))
      }

      commitTodos(
        todos.map((todo) => ({
          ...todo,
          active: false,
        })),
      )
      setRevisionEvents((current) =>
        normalizeRevisionEvents(current).map((item) => {
          if (item.id === event.id) {
            return { ...item, status: 'active' }
          }

          return item.status === 'active' && item.completedPomodoros < item.requiredPomodoros
            ? { ...item, status: 'pending' }
            : item
        }),
      )
      setPomodoroRun((current) => ({
        ...current,
        targetPomodoros: event.requiredPomodoros,
        completedInTarget: event.completedPomodoros,
        currentRun: event.completedPomodoros,
      }))
      setTimerMode('focus')

      if (!sameActiveRevision || timerMode !== 'focus' || timerRemaining <= 0) {
        setTimerRemaining(timerSeconds('focus', timerSettings))
      }

      setTimerRunning(true)
    },
    [
      activeRevisionEvent,
      activeTask,
      commitTodos,
      revisionEvents,
      run.completedInTarget,
      run.currentRun,
      run.targetPomodoros,
      setPomodoroRun,
      setRevisionEvents,
      setTaskPomodoroMemory,
      setTimerMode,
      setTimerRemaining,
      setTimerRunning,
      timerMode,
      timerRemaining,
      timerSettings,
      todos,
    ],
  )

  const pauseRevisionEvent = useCallback(
    (eventId: string) => {
      if (activeRevisionEvent?.id !== eventId) {
        return
      }

      setTimerRunning(false)
    },
    [activeRevisionEvent, setTimerRunning],
  )

  const markRevisionEventDone = useCallback(
    (eventId: string) => {
      const event = revisionEvents.find((item) => item.id === eventId)
      const course = event
        ? revisionCourses.find((item) => item.id === event.courseId)
        : undefined

      if (!event || event.status === 'done') {
        return
      }

      completeRevisionEvent(eventId)
      recordActivity()
      triggerTaskUnlock(course?.title)
      setPomodoroRun((current) => recordRevisionManualCompletionReward(current))

      if (activeRevisionEvent?.id === eventId) {
        setTimerRunning(false)
      }

      if (event.linkedTodoId) {
        commitTodos(
          todos.map((todo) =>
            todo.id === event.linkedTodoId
              ? {
                  ...todo,
                  completed: true,
                  active: false,
                  completedPomodoros: todo.requiredPomodoros,
                  completedAt: todo.completedAt ?? Date.now(),
                  updatedAt: Date.now(),
                }
              : todo,
          ),
        )
      }
    },
    [
      activeRevisionEvent,
      commitTodos,
      completeRevisionEvent,
      recordActivity,
      revisionCourses,
      revisionEvents,
      setPomodoroRun,
      setTimerRunning,
      todos,
      triggerTaskUnlock,
    ],
  )

  const changeRevisionSettings = useCallback(
    (patch: Partial<RevisionSettings>) => {
      setRevisionSettings({
        ...revisionSettings,
        ...patch,
      })
    },
    [revisionSettings, setRevisionSettings],
  )

  const performRevisionGoogleCalendarSync = useCallback(
    async (accessToken = googleCalendarTokenRef.current?.accessToken) => {
      if (!isGoogleCalendarConfigured()) {
        setRevisionGoogleCalendar((current) => ({
          ...normalizeGoogleCalendarSync(current),
          lastError: copy.revisions.googleCalendarConfiguredNeeded,
        }))
        return
      }

      if (!accessToken) {
        setGoogleCalendarSessionConnected(false)
        setRevisionGoogleCalendar((current) => ({
          ...normalizeGoogleCalendarSync(current),
          enabled: true,
          lastError: copy.revisions.googleCalendarNeedsConnect,
        }))
        return
      }

      while (googleCalendarSyncInFlightRef.current) {
        await googleCalendarSyncInFlightRef.current
      }

      const syncPromise = (async () => {
        try {
          const nextState = await syncRevisionEventsToGoogleCalendar({
            state: revisionGoogleCalendar,
            events: revisionEvents,
            courses: revisionCourses,
            accessToken,
            timezone: getBrowserTimezone(),
          })

          setRevisionGoogleCalendar(nextState)
        } catch (error) {
          const errorCode = error instanceof Error ? error.message : ''

          if (
            errorCode === 'google_calendar_auth_expired' &&
            googleCalendarTokenRef.current?.accessToken === accessToken
          ) {
            googleCalendarTokenRef.current = null
            clearGoogleCalendarTokenSession()
            setGoogleCalendarSessionConnected(false)
          }

          setRevisionGoogleCalendar((current) => ({
            ...normalizeGoogleCalendarSync(current),
            enabled: true,
            lastError:
              errorCode === 'google_calendar_auth_expired'
                ? copy.revisions.googleCalendarAuthExpired
                : errorCode === 'google_calendar_rate_limited'
                  ? copy.revisions.googleCalendarRateLimited
                  : copy.revisions.googleCalendarSyncFailed,
          }))
        }
      })()

      googleCalendarSyncInFlightRef.current = syncPromise

      try {
        await syncPromise
      } finally {
        if (googleCalendarSyncInFlightRef.current === syncPromise) {
          googleCalendarSyncInFlightRef.current = null
        }
      }
    },
    [
      copy.revisions.googleCalendarConfiguredNeeded,
      copy.revisions.googleCalendarAuthExpired,
      copy.revisions.googleCalendarNeedsConnect,
      copy.revisions.googleCalendarRateLimited,
      copy.revisions.googleCalendarSyncFailed,
      revisionCourses,
      revisionEvents,
      revisionGoogleCalendar,
      setRevisionGoogleCalendar,
    ],
  )

  const connectRevisionGoogleCalendar = useCallback(async () => {
    try {
      const tokenSession = await requestGoogleCalendarAccessToken()
      googleCalendarTokenRef.current = tokenSession
      storeGoogleCalendarTokenSession(tokenSession)
      setGoogleCalendarSessionConnected(true)
      setRevisionGoogleCalendar((current) => ({
        ...normalizeGoogleCalendarSync(current),
        enabled: true,
        lastError: null,
      }))
      await performRevisionGoogleCalendarSync(tokenSession.accessToken)
    } catch (error) {
      googleCalendarTokenRef.current = null
      clearGoogleCalendarTokenSession()
      setGoogleCalendarSessionConnected(false)
      setRevisionGoogleCalendar((current) => ({
        ...normalizeGoogleCalendarSync(current),
        lastError:
          error instanceof Error &&
          error.message === 'google_calendar_rate_limited'
            ? copy.revisions.googleCalendarRateLimited
            : copy.revisions.googleCalendarAuthExpired,
      }))
    }
  }, [
    copy.revisions.googleCalendarAuthExpired,
    copy.revisions.googleCalendarRateLimited,
    performRevisionGoogleCalendarSync,
    setRevisionGoogleCalendar,
  ])

  const syncRevisionGoogleCalendarNow = useCallback(async () => {
    const tokenSession = googleCalendarTokenRef.current

    if (!isGoogleCalendarTokenSessionUsable(tokenSession)) {
      googleCalendarTokenRef.current = null
      clearGoogleCalendarTokenSession()
      await connectRevisionGoogleCalendar()
      return
    }

    await performRevisionGoogleCalendarSync(tokenSession.accessToken)
  }, [connectRevisionGoogleCalendar, performRevisionGoogleCalendarSync])

  useEffect(() => {
    window.clearTimeout(googleCalendarSyncTimerRef.current)

    const previousSource = googleCalendarSyncSourceRef.current
    const sourceChanged =
      previousSource.courses !== revisionCourses ||
      previousSource.events !== revisionEvents
    googleCalendarSyncSourceRef.current = {
      courses: revisionCourses,
      events: revisionEvents,
    }

    const tokenSession = googleCalendarTokenRef.current

    if (!isGoogleCalendarTokenSessionUsable(tokenSession)) {
      if (tokenSession) {
        googleCalendarTokenRef.current = null
        clearGoogleCalendarTokenSession()
        setGoogleCalendarSessionConnected(false)
      }
      return
    }

    if (
      !sourceChanged ||
      !revisionGoogleCalendar.enabled ||
      !isGoogleCalendarConfigured()
    ) {
      return
    }

    googleCalendarSyncTimerRef.current = window.setTimeout(() => {
      void performRevisionGoogleCalendarSync(tokenSession.accessToken)
    }, 1_200)

    return () => {
      window.clearTimeout(googleCalendarSyncTimerRef.current)
    }
  }, [
    performRevisionGoogleCalendarSync,
    revisionCourses,
    revisionEvents,
    revisionGoogleCalendar.enabled,
  ])

  const completeFocusSession = useCallback(() => {
    recordActivity()

    if (activeRevisionEvent) {
      const nextCompletedPomodoros = Math.min(
        activeRevisionEvent.completedPomodoros + 1,
        activeRevisionEvent.requiredPomodoros,
      )
      const completed =
        nextCompletedPomodoros >= activeRevisionEvent.requiredPomodoros

      setRevisionEvents((current) =>
        normalizeRevisionEvents(current).map((event) =>
          event.id === activeRevisionEvent.id
            ? {
                ...event,
                completedPomodoros: nextCompletedPomodoros,
                status: completed ? 'done' : event.status,
                completedAt: completed ? event.completedAt ?? Date.now() : null,
              }
            : event,
        ),
      )

      if (completed) {
        triggerTaskUnlock(activeRevisionCourse?.title)
        setPomodoroRun((current) => ({
          ...current,
          targetPomodoros: Math.max(current.targetPomodoros, 1),
        }))
      }

      return
    }

    if (!activeTask) {
      return
    }

    const beforeRemaining = activeTask.requiredPomodoros - activeTask.completedPomodoros
    updateTaskPomodoro(activeTask.id, 1, false)

    if (beforeRemaining <= 1) {
      triggerTaskUnlock(activeTask.text)
      setPomodoroRun((current) => ({
        ...current,
        targetPomodoros: Math.max(current.targetPomodoros, 1),
      }))
    }
  }, [
    activeRevisionCourse,
    activeRevisionEvent,
    activeTask,
    recordActivity,
    setPomodoroRun,
    setRevisionEvents,
    triggerTaskUnlock,
    updateTaskPomodoro,
  ])

  const completeTimerSegment = useCallback(() => {
    if (timerMode !== 'focus') {
      setTimerMode('focus')
      setTimerRunning(run.autoCycle)
      return timerSeconds('focus', timerSettings)
    }

    completeFocusSession()
    const target = clampPomodoros(run.targetPomodoros)
    const nextRunCount = run.currentRun + 1
    const nextCompleted = Math.min(run.completedInTarget + 1, target)
    const objectiveComplete = nextCompleted >= target

    setPomodoroRun(
      recordPomodoroStar(
        {
          ...run,
          targetPomodoros: target,
          completedInTarget: nextCompleted,
        },
        nextRunCount,
      ),
    )

    if (objectiveComplete) {
      setTimerRunning(false)
      return 0
    }

    const nextMode: TimerMode =
      nextRunCount % clampPomodoros(timerSettings.longBreakEvery) === 0
        ? 'longBreak'
        : 'shortBreak'

    setTimerMode(nextMode)
    setTimerRunning(run.autoCycle)
    return timerSeconds(nextMode, timerSettings)
  }, [
    completeFocusSession,
    run,
    setPomodoroRun,
    setTimerMode,
    setTimerRunning,
    timerMode,
    timerSettings,
  ])

  useEffect(() => {
    if (!timerRunning) {
      return
    }

    const interval = window.setInterval(() => {
      setTimerRemaining((current) => {
        if (current > 1) {
          return current - 1
        }

        window.clearInterval(interval)
        return completeTimerSegment()
      })
    }, 1_000)

    return () => window.clearInterval(interval)
  }, [completeTimerSegment, setTimerRemaining, timerRunning])

  const nextSessionToday = dateKey()
  const nextSessionTodayRevisions = todayRevisionEvents(
    revisionEvents,
    nextSessionToday,
  )
  const nextSessionDueRevisions = revisionsDueToday(
    nextSessionTodayRevisions,
    nextSessionToday,
  )
  const nextRevisionEvent =
    activeRevisionEvent ?? nextSessionDueRevisions[0] ?? null
  const nextRevisionCourse = nextRevisionEvent
    ? revisionCourses.find((course) => course.id === nextRevisionEvent.courseId)
    : undefined
  const nextRevisionLabel = nextRevisionEvent
    ? nextRevisionCourse
      ? `${nextRevisionCourse.title} - ${revisionOffsetLabel(
          nextRevisionCourse,
          nextRevisionEvent,
          copy.revisions.revisionPrefix,
        )}`
      : copy.revisions.courseName
    : ''
  const receivedFriendRequestCount = social.invites.filter(
    (invite) =>
      invite.status === 'pending' && invite.recipientId === cloudSync.user?.id,
  ).length
  const revisionDockBadgeLabel = nextRevisionLabel || copy.revisions.todayEmpty
  const friendsDockBadgeLabel =
    receivedFriendRequestCount > 0
      ? copy.friends.pendingReceived
      : copy.friends.title
  const taskWindowBadges = useMemo(
    () =>
      displayedTaskWindows.reduce<Record<string, { count: number; label?: string }>>(
        (badges, taskWindow) => {
          const openCount = todos.filter(
            (todo) =>
              !todo.completed &&
              (todo.windowId ?? DEFAULT_TASK_WINDOW_ID) === taskWindow.id,
          ).length

          if (openCount > 0) {
            badges[taskWindow.id] = {
              count: openCount,
              label: copy.todo.taskBadge(openCount),
            }
          }

          return badges
        },
        {},
      ),
    [copy.todo, displayedTaskWindows, todos],
  )

  const renderTaskWindow = (taskWindow: TaskWindow) => {
    const windowTodos = todos.filter(
      (todo) =>
        (todo.windowId ?? DEFAULT_TASK_WINDOW_ID) === taskWindow.id,
    )

    return (
      <TodoWidget
        copy={copy.todo}
        windowTitle={taskWindow.title}
        windowEmoji={taskWindow.emoji ?? taskWindowEmojiForIndex(taskWindow.rank)}
        windowEmojiOptions={TASK_WINDOW_EMOJIS}
        canDeleteWindow={taskWindow.deletable}
        todos={windowTodos}
        activeTaskId={activeTask?.id}
        isTimerRunning={timerRunning}
        onRenameWindow={(title) => renameTaskWindow(taskWindow.id, title)}
        onEmojiChange={(emoji) => changeTaskWindowEmoji(taskWindow.id, emoji)}
        onDeleteWindow={() => deleteTaskWindow(taskWindow.id)}
        onAddTask={(text, requiredPomodoros, priority, difficulty) =>
          addTask(taskWindow.id, text, requiredPomodoros, priority, difficulty)
        }
        onUpdateTask={updateTask}
        onToggleTask={toggleTask}
        onDeleteTask={deleteTask}
        onDeleteTasks={deleteTasks}
        onReorderTask={reorderTask}
        onRepeatTask={repeatTask}
        onSetActive={setTaskActive}
        onStartTaskTimer={startTaskTimer}
        onPauseTaskTimer={pauseTaskTimer}
      />
    )
  }

  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case 'pomodoro':
        return (
          <PomodoroWidget
            copy={copy.pomodoro}
            currentTime={currentTime}
            estimatedEndAt={
              timerRunning
                ? (timerEndAtRef.current ?? currentTime + timerRemaining * 1_000)
                : currentTime + timerRemaining * 1_000
            }
            language={language}
            mode={timerMode}
            remaining={timerRemaining}
            isRunning={timerRunning}
            run={run}
            timerSettings={timerSettings}
            activeTaskLabel={
              activeTask?.text ??
              (activeRevisionCourse
                ? copy.revisions.linkedTaskLabel(activeRevisionCourse.title)
                : undefined)
            }
            onModeChange={setTimerMode}
            onRemainingChange={setTimerRemaining}
            onRunningChange={setTimerRunning}
            onRunChange={changePomodoroRun}
            onTargetChange={updatePomodoroTarget}
            onStartFreeFocus={startFreeFocus}
            onCompleteSegment={completeTimerSegment}
          />
        )
      case 'todo':
        return renderTaskWindow(
          displayedTaskWindows.find((window) => window.id === DEFAULT_TASK_WINDOW_ID) ??
            displayedTaskWindows[0],
        )
      case 'revisionDashboard':
        return (
          <RevisionDashboardWidget
            copy={copy.revisions}
            todoCopy={copy.todo}
            courses={revisionCourses}
            subjects={revisionSubjects}
            events={revisionEvents}
            activeRevisionEventId={activeRevisionEvent?.id}
            isTimerRunning={timerRunning}
            onStartEvent={startRevisionEvent}
            onPauseEvent={pauseRevisionEvent}
            onMarkDone={markRevisionEventDone}
            onUpdateEvent={updateRevisionEvent}
            onOpenPlanner={handleRevisionPlannerDockToggle}
          />
        )
      case 'friends':
        return null
      case 'youtube':
        return <YoutubeWidget copy={copy.youtube} />
      case 'backgrounds':
        return (
          <BackgroundsWidget
            copy={copy.backgrounds}
            backgrounds={backgrounds}
            selectedId={activeBackground.id}
            uploadError={uploadError}
            onSelect={selectBackground}
            onUpload={handleUpload}
            onDeleteUpload={handleDeleteUpload}
          />
        )
    }
  }

  const dockLayouts = useMemo(() => {
    if (!isMobileWorkspace) {
      return layouts
    }

    return WIDGET_ORDER.reduce(
      (nextLayouts, id) => {
        nextLayouts[id] = {
          ...layouts[id],
          visible: mobileWorkspacePage === id && layouts[id].visible,
        }
        return nextLayouts
      },
      {} as Record<WidgetId, WidgetLayout>,
    )
  }, [isMobileWorkspace, layouts, mobileWorkspacePage])

  const dockTaskWindowLayouts = useMemo(() => {
    if (!isMobileWorkspace) {
      return taskWindowLayouts
    }

    return displayedTaskWindows.reduce(
      (nextLayouts, taskWindow) => {
        const layout = taskWindowLayouts[taskWindow.id]

        if (layout) {
          nextLayouts[taskWindow.id] = {
            ...layout,
            visible:
              mobileWorkspacePage === taskMobilePage(taskWindow.id) &&
              layout.visible,
          }
        }

        return nextLayouts
      },
      {} as Record<string, WidgetLayout>,
    )
  }, [
    displayedTaskWindows,
    isMobileWorkspace,
    mobileWorkspacePage,
    taskWindowLayouts,
  ])

  const visibleStaticWidgetIds = useMemo(
    () =>
      isMobileWorkspace
        ? STATIC_WIDGET_ORDER.filter(
            (id) => mobileWorkspacePage === id && layouts[id].visible,
          )
        : STATIC_WIDGET_ORDER,
    [isMobileWorkspace, layouts, mobileWorkspacePage],
  )

  const visibleTaskWindows = useMemo(
    () =>
      isMobileWorkspace
        ? displayedTaskWindows.filter((taskWindow) => {
            const layout = taskWindowLayouts[taskWindow.id]
            return (
              mobileWorkspacePage === taskMobilePage(taskWindow.id) &&
              layout?.visible
            )
          })
        : displayedTaskWindows,
    [
      displayedTaskWindows,
      isMobileWorkspace,
      mobileWorkspacePage,
      taskWindowLayouts,
    ],
  )
  const revisionPlannerVisible =
    revisionPlannerOpen && (!isMobileWorkspace || mobileWorkspacePage === 'planner')
  const friendsPageVisible =
    friendsPageOpen && (!isMobileWorkspace || mobileWorkspacePage === 'friends')
  const guidePageVisible = guidePageOpen
  const timerDuration = Math.max(timerSeconds(timerMode, timerSettings), 1)
  const miniPomodoroProgress = Math.round(
    (Math.min(Math.max(timerDuration - timerRemaining, 0), timerDuration) /
      timerDuration) *
      100,
  )
  const pomodoroPageVisible = isMobileWorkspace
    ? mobileWorkspacePage === 'pomodoro' &&
      layouts.pomodoro.visible &&
      !revisionPlannerVisible &&
      !friendsPageVisible
    : layouts.pomodoro.visible
  const hasPomodoroSession =
    timerRunning ||
    timerRemaining < timerDuration ||
    Boolean(activeTask) ||
    Boolean(activeRevisionEvent) ||
    run.currentRun > 0 ||
    run.completedInTarget > 0
  const showMiniPomodoro =
    !pomodoroPageVisible && hasPomodoroSession && !settingsOpen
  const openMiniPomodoro = useCallback(() => {
    if (isMobileWorkspace) {
      setMobileWorkspacePage('pomodoro')
      setRevisionPlannerOpen(false)
      setFriendsPageOpen(false)
    }

    focusWidget('pomodoro')
  }, [focusWidget, isMobileWorkspace])
  const toggleMiniPomodoroRunning = useCallback(() => {
    setTimerRunning((current) => (timerRemaining > 0 ? !current : false))
  }, [setTimerRunning, timerRemaining])

  return (
    <div
      className={[
        'app-shell',
        highContrast ? 'is-high-contrast' : '',
        isMobileWorkspace ? 'is-mobile-page-mode' : '',
      ].filter(Boolean).join(' ')}
    >
      <BackgroundLayer
        background={activeBackground}
        dim={backgroundDim}
        particlesEnabled={particlesEnabled}
      />
      <span className="background-watermark" aria-label={activeBackground.label}>
        {activeBackground.label}
      </span>
      <TopBar
        copy={copy}
        streak={streak}
        streakIgniteKey={streakIgniteKey}
        streakUnlockCue={streakUnlockCue}
        flameEvolution={flameEvolution}
        flameEvolutionCue={flameEvolutionCue}
        onFlameEffectChange={updateFlameQuestEffect}
        onClaimFlameEvolution={claimFlameEvolution}
        run={run}
        starBurstKey={run.lastStarAt}
        bestRunBurstKey={bestRunBurstKey}
        cloudUser={cloudSync.user}
        cloudStatus={cloudSync.status}
        cloudConflict={cloudSync.conflict}
        miniPomodoro={
          showMiniPomodoro ? (
            <MiniPomodoroButton
              mode={timerMode}
              remaining={timerRemaining}
              progress={miniPomodoroProgress}
              isRunning={timerRunning}
              label={`${copy.widgets.pomodoro} - ${formatCompactTime(timerRemaining)}`}
              toggleLabel={timerRunning ? copy.pomodoro.pause : copy.pomodoro.start}
              clockText={formatClockTime(currentTime, language)}
              clockDateTime={new Date(currentTime).toISOString()}
              clockLabel={copy.pomodoro.currentTime(
                formatClockTime(currentTime, language),
              )}
              clockTooltip={
                timerRunning
                  ? copy.pomodoro.estimatedEnd(
                      formatClockTime(
                        timerEndAtRef.current ?? currentTime + timerRemaining * 1_000,
                        language,
                      ),
                    )
                  : copy.pomodoro.estimatedEndIfStarted(
                      formatClockTime(currentTime + timerRemaining * 1_000, language),
                    )
              }
              onOpen={openMiniPomodoro}
              onToggleRunning={toggleMiniPomodoroRunning}
            />
          ) : null
        }
        onOpenSettings={() => setSettingsOpen(true)}
        onCloudSignIn={cloudSync.signIn}
        onCloudSignOut={cloudSync.signOut}
        onCloudSyncNow={cloudSync.syncNow}
        onUseCloudVersion={cloudSync.useCloudVersion}
        onUseLocalVersion={cloudSync.useLocalVersion}
        onExportLocalBackup={cloudSync.exportLocalBackup}
      />
      <SettingsPanel
        copy={copy.settings}
        streakCopy={copy.streak}
        isOpen={settingsOpen}
        language={language}
        widgetLabels={widgetLabels}
        layouts={layouts}
        taskWindows={displayedTaskWindows}
        taskWindowLayouts={taskWindowLayouts}
        streak={streak}
        flameEvolution={flameEvolution}
        timerSettings={timerSettings}
        memoryStatus={memoryStatus}
        memoryNotice={memoryNotice}
        backgroundDim={backgroundDim}
        particlesEnabled={particlesEnabled}
        highContrast={highContrast}
        onClose={() => setSettingsOpen(false)}
        onLanguageChange={setLanguageState}
        onResetLayout={resetLayout}
        onToggleWidget={toggleWidget}
        onToggleTaskWindow={toggleTaskWindow}
        onDailyGoalChange={updateDailyGoal}
        onAddStreakDay={addTemporaryStreakDay}
        onRevealFlameHint={revealFlameHint}
        onTimerSettingChange={updateTimerSetting}
        onBackgroundDimChange={setBackgroundDim}
        onParticlesEnabledChange={setParticlesEnabled}
        onHighContrastChange={setHighContrast}
        onExportData={exportData}
        onImportData={importData}
      />
      {guidePageVisible ? (
        <Suspense fallback={<div className="page-loader" role="status">{copy.app.loading}</div>}>
          <GuidePage
            language={language}
            onClose={closeGuidePage}
            onPrepareStep={prepareGuideStep}
          />
        </Suspense>
      ) : null}
      {revisionPlannerVisible ? (
        <Suspense fallback={<div className="page-loader" role="status">{copy.app.loading}</div>}>
          <RevisionPlannerPage
            copy={copy.revisions}
            todoCopy={copy.todo}
            language={language}
            courses={revisionCourses}
            subjects={revisionSubjects}
            events={revisionEvents}
            methods={revisionMethods}
            settings={revisionSettings}
            googleCalendar={revisionGoogleCalendar}
            googleCalendarConfigured={isGoogleCalendarConfigured()}
            googleCalendarSessionConnected={googleCalendarSessionConnected}
            guideStep={guideTourStep}
            onClose={closeRevisionPlanner}
            onSettingsChange={changeRevisionSettings}
            onSaveCourse={saveRevisionCourse}
            onSaveSubject={saveRevisionSubject}
            onDeleteSubject={deleteRevisionSubject}
            onDeleteCourse={deleteRevisionCourse}
            onDeleteEvent={deleteRevisionEvent}
            onStartEvent={startRevisionEvent}
            onMarkDone={markRevisionEventDone}
            onConnectGoogleCalendar={connectRevisionGoogleCalendar}
            onSyncGoogleCalendar={syncRevisionGoogleCalendarNow}
            onRescheduleEvent={rescheduleRevisionEvent}
            onUpdateEvent={updateRevisionEvent}
            onSaveMethod={saveRevisionMethod}
            onDeleteMethod={deleteRevisionMethod}
          />
        </Suspense>
      ) : null}
      {friendsPageVisible ? (
        <Suspense fallback={<div className="page-loader" role="status">{copy.app.loading}</div>}>
          <FriendsPage
            copy={copy.friends}
            flameCopy={copy.streak}
            user={cloudSync.user}
            profile={social.profile}
            friends={social.friends}
            invites={social.invites}
            leaderboard={social.leaderboard}
            lookup={social.lookup}
            loading={social.loading}
            message={social.message}
            onClose={closeFriendsPage}
            onRefresh={social.refresh}
            onSearchCode={social.searchFriendCode}
            onSendInviteByCode={social.sendInviteByCode}
            onRegenerateCode={social.regenerateCode}
            onAcceptInvite={social.acceptInvite}
            onDeclineInvite={social.declineInvite}
            onCancelInvite={social.cancelInvite}
            onClearLookup={social.clearLookup}
          />
        </Suspense>
      ) : null}
      <Dock
        labels={widgetLabels}
        taskWindows={displayedTaskWindows}
        label={copy.dock.label}
        layouts={dockLayouts}
        taskWindowLayouts={dockTaskWindowLayouts}
        badges={{
          revisionDashboard: {
            count: nextSessionDueRevisions.length,
            label: revisionDockBadgeLabel,
          },
          friends: {
            count: receivedFriendRequestCount,
            label: friendsDockBadgeLabel,
          },
          taskWindows: taskWindowBadges,
        }}
        addTaskWindowLabel={copy.todo.addWindow}
        guideLabel={copy.dock.guide}
        guideOpen={guidePageOpen}
        revisionPlannerLabel={copy.revisions.plannerOpen}
        revisionPlannerOpen={revisionPlannerOpen}
        friendsPageLabel={copy.friends.title}
        friendsPageOpen={friendsPageOpen}
        onToggle={handleDockWidgetToggle}
        onToggleTaskWindow={handleDockTaskWindowToggle}
        onAddTaskWindow={addTaskWindow}
        onOpenGuidePage={handleGuidePageDockToggle}
        onOpenRevisionPlanner={handleRevisionPlannerDockToggle}
        onOpenFriendsPage={handleFriendsPageDockToggle}
      />
      <main className="workspace" aria-label={copy.app.workspace}>
        {visibleStaticWidgetIds.map((id) => (
          <WidgetFrame
            key={id}
            title={widgetLabels[id]}
            copy={copy.widgetFrame}
            icon={widgetIcons[id]}
            layout={layouts[id]}
            onLayoutChange={updateLayout}
            onClose={() => hideWidget(id)}
            onFocus={() => focusWidget(id)}
          >
            {renderWidget(id)}
          </WidgetFrame>
        ))}
        {visibleTaskWindows.map((taskWindow) => (
          <WidgetFrame
            key={taskWindow.id}
            title={taskWindow.title}
            copy={copy.widgetFrame}
            icon={widgetIcons.todo}
            layout={taskWindowLayouts[taskWindow.id]}
            onLayoutChange={updateTaskWindowLayout}
            onClose={() => hideTaskWindow(taskWindow.id)}
            onFocus={() => focusTaskWindow(taskWindow.id)}
          >
            {renderTaskWindow(taskWindow)}
          </WidgetFrame>
        ))}
      </main>
    </div>
  )
}

export default App
