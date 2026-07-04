import { CheckSquare, Image, Timer, Video } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BackgroundLayer } from './components/layout/BackgroundLayer'
import { Dock } from './components/layout/Dock'
import { SettingsPanel } from './components/layout/SettingsPanel'
import { TopBar } from './components/layout/TopBar'
import { WidgetFrame } from './components/layout/WidgetFrame'
import { BackgroundsWidget } from './components/widgets/BackgroundsWidget'
import { PomodoroWidget } from './components/widgets/PomodoroWidget'
import { TodoWidget } from './components/widgets/TodoWidget'
import { YoutubeWidget } from './components/widgets/YoutubeWidget'
import { useCloudSync } from './hooks/useCloudSync'
import { usePersistentState } from './hooks/usePersistentState'
import {
  BUILT_IN_BACKGROUNDS,
  DEFAULT_FLAME_EVOLUTION,
  DEFAULT_LAYOUTS,
  DEFAULT_POMODORO_RUN,
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
  normalizeFlameEvolution,
  revealFlameAchievementHint,
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
  normalizeTaskWindowLayouts,
  normalizeTaskWindows,
} from './lib/taskWindows'
import { publicPath } from './lib/publicPath'
import {
  DEFAULT_LANGUAGE,
  getCopy,
  normalizeLanguage,
} from './lib/i18n'
import { normalizePomodoroRun } from './lib/pomodoroRun'
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
  youtube: <Video size={18} strokeWidth={1.8} />,
  backgrounds: <Image size={18} strokeWidth={1.8} />,
}

const CURRENT_LAYOUT_VERSION = 11
const STREAK_TASK_UNLOCK_KEY = 'muslim-study-place:streak:lastTaskUnlockDate'
const STATIC_WIDGET_ORDER = WIDGET_ORDER.filter((id) => id !== 'todo')

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
  const activeTask = todos.find((todo) => todo.active && !todo.completed)
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
  const [pomodoroRun, setPomodoroRun] = usePersistentState(
    'pomodoroRun',
    DEFAULT_POMODORO_RUN,
  )
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
          : {}),
      }),
    [normalizedPomodoroRun, syncedActiveTaskMemory],
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
  const [settingsOpen, setSettingsOpen] = useState(false)
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
    if (languageState !== language) {
      setLanguageState(language)
    }
  }, [language, languageState, setLanguageState])

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
    run.completedInTarget,
    run.currentRun,
    run.targetPomodoros,
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

  const commitTodos = useCallback(
    (nextTodos: TodoItem[], recordManualCompletion = false) => {
      const normalized = normalizeTodos(nextTodos)

      if (recordManualCompletion) {
        const completedTask = normalized.find((todo) => {
          const before = todos.find((item) => item.id === todo.id)
          return before && !before.completed && todo.completed
        })

        if (completedTask) {
          recordActivity()
          triggerTaskUnlock(completedTask.text)
        }
      }

      setTodos(normalized)
    },
    [recordActivity, setTodos, todos, triggerTaskUnlock],
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
    const rank = taskWindows.length
      ? Math.max(...taskWindows.map((window) => window.rank)) + 1
      : 1

    setTaskWindows((current) =>
      normalizeTaskWindows([
        ...current,
        {
          id,
          title,
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

  const nextManualRank = (windowId = DEFAULT_TASK_WINDOW_ID, fallback = 0) => {
    const ranks = todos
      .filter(
        (todo) =>
          !todo.completed &&
          (todo.windowId ?? DEFAULT_TASK_WINDOW_ID) === windowId,
      )
      .map((todo) => todo.rank)

    return ranks.length ? Math.min(...ranks) - 1 : fallback
  }

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
  }, [activeTask, changePomodoroRun, commitTodos, run, todos])

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

  const deleteTasks = (taskIds: string[]) => {
    const ids = new Set(taskIds)

    if (!ids.size) {
      return
    }

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
  }

  const deleteTask = (taskId: string) => {
    deleteTasks([taskId])
  }

  const completeFocusSession = useCallback(() => {
    recordActivity()

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
  }, [activeTask, recordActivity, setPomodoroRun, triggerTaskUnlock, updateTaskPomodoro])

  const renderTaskWindow = (taskWindow: TaskWindow) => {
    const windowTodos = todos.filter(
      (todo) =>
        (todo.windowId ?? DEFAULT_TASK_WINDOW_ID) === taskWindow.id,
    )

    return (
      <TodoWidget
        copy={copy.todo}
        windowTitle={taskWindow.title}
        canDeleteWindow={taskWindow.deletable}
        todos={windowTodos}
        activeTaskId={activeTask?.id}
        isTimerRunning={timerRunning}
        onRenameWindow={(title) => renameTaskWindow(taskWindow.id, title)}
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
            mode={timerMode}
            remaining={timerRemaining}
            isRunning={timerRunning}
            run={run}
            timerSettings={timerSettings}
            activeTaskLabel={activeTask?.text}
            onModeChange={setTimerMode}
            onRemainingChange={setTimerRemaining}
            onRunningChange={setTimerRunning}
            onRunChange={changePomodoroRun}
            onTargetChange={updatePomodoroTarget}
            onStartFreeFocus={startFreeFocus}
            onFocusComplete={completeFocusSession}
          />
        )
      case 'todo':
        return renderTaskWindow(
          displayedTaskWindows.find((window) => window.id === DEFAULT_TASK_WINDOW_ID) ??
            displayedTaskWindows[0],
        )
      case 'youtube':
        return <YoutubeWidget copy={copy.youtube} />
      case 'backgrounds':
        return (
          <BackgroundsWidget
            copy={copy.backgrounds}
            backgrounds={backgrounds}
            selectedId={activeBackground.id}
            uploadError={uploadError}
            onSelect={setSelectedBackgroundId}
            onUpload={handleUpload}
            onDeleteUpload={handleDeleteUpload}
          />
        )
    }
  }

  return (
    <div className="app-shell">
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
        onExportData={exportData}
        onImportData={importData}
      />
      <Dock
        labels={widgetLabels}
        taskWindows={displayedTaskWindows}
        label={copy.dock.label}
        layouts={layouts}
        taskWindowLayouts={taskWindowLayouts}
        addTaskWindowLabel={copy.todo.addWindow}
        onToggle={toggleWidget}
        onFocus={focusWidget}
        onToggleTaskWindow={toggleTaskWindow}
        onFocusTaskWindow={focusTaskWindow}
        onAddTaskWindow={addTaskWindow}
      />
      <main className="workspace" aria-label={copy.app.workspace}>
        {STATIC_WIDGET_ORDER.map((id) => (
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
        {displayedTaskWindows.map((taskWindow) => (
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
