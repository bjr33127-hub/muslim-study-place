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
import { usePersistentState } from './hooks/usePersistentState'
import {
  BUILT_IN_BACKGROUNDS,
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
import { normalizeStreak, recordStreakActivity } from './lib/streak'
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
import { publicPath } from './lib/publicPath'
import {
  DEFAULT_LANGUAGE,
  getCopy,
  normalizeLanguage,
} from './lib/i18n'
import {
  buildDurableSnapshot,
  getDurableStorageStatus,
  importDurableSnapshot,
} from './lib/storage'
import type {
  AppLanguage,
  BackgroundAsset,
  MemoryStatus,
  PomodoroRunState,
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
  const run = useMemo(
    () => ({
      ...DEFAULT_POMODORO_RUN,
      ...pomodoroRun,
      ...(syncedActiveTaskMemory
        ? {
            targetPomodoros: syncedActiveTaskMemory.targetPomodoros,
            completedInTarget: syncedActiveTaskMemory.completedInTarget,
            currentRun: syncedActiveTaskMemory.currentRun,
          }
        : {}),
    }),
    [pomodoroRun, syncedActiveTaskMemory],
  )
  const [streakState, setStreakState] = usePersistentState('streak', DEFAULT_STREAK)
  const streak = useMemo(() => normalizeStreak(streakState), [streakState])
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
    document.documentElement.lang = language
  }, [language])

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
      setLayouts((current) => ({
        ...mergeDefaultLayouts(current),
        [layout.id]: layout,
      }))
    },
    [setLayouts],
  )

  const focusWidget = useCallback(
    (id: WidgetId) => {
      setLayouts((current) => {
        const merged = mergeDefaultLayouts(current)
        const maxZ = Math.max(...WIDGET_ORDER.map((widgetId) => merged[widgetId].z))

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
    [setLayouts],
  )

  const toggleWidget = useCallback(
    (id: WidgetId) => {
      setLayouts((current) => {
        const merged = mergeDefaultLayouts(current)
        const nextVisible = !merged[id].visible
        const maxZ = Math.max(...WIDGET_ORDER.map((widgetId) => merged[widgetId].z))

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
    [setLayouts],
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
    setStreakState((current) => recordStreakActivity(normalizeStreak(current)))
  }, [setStreakState])

  const commitTodos = useCallback(
    (nextTodos: TodoItem[], recordManualCompletion = false) => {
      const normalized = normalizeTodos(nextTodos)

      if (recordManualCompletion) {
        const completedNow = normalized.some((todo) => {
          const before = todos.find((item) => item.id === todo.id)
          return before && !before.completed && todo.completed
        })

        if (completedNow) {
          recordActivity()
        }
      }

      setTodos(normalized)
    },
    [recordActivity, setTodos, todos],
  )

  const updateDailyGoal = (value: number) => {
    setStreakState((current) => ({
      ...normalizeStreak(current),
      dailyGoal: Math.min(Math.max(value || 1, 1), 12),
    }))
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

  const nextManualRank = () => {
    const ranks = todos
      .filter((todo) => !todo.completed)
      .map((todo) => todo.rank)

    return ranks.length ? Math.min(...ranks) - 1 : Date.now()
  }

  const addTask = (
    text: string,
    requiredPomodoros: number,
    priority: TodoPriority,
    difficulty: TodoDifficulty,
  ) => {
    const now = Date.now()
    const normalizedPriority = normalizePriority(priority)
    const normalizedDifficulty = normalizeDifficulty(difficulty)

    commitTodos([
      {
        id: `todo-${Date.now()}`,
        text,
        priority: normalizedPriority,
        difficulty: normalizedDifficulty,
        rank: nextManualRank(),
        completed: false,
        active: !todos.some((todo) => todo.active && !todo.completed),
        requiredPomodoros: clampPomodoros(requiredPomodoros),
        completedPomodoros: 0,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        repeatIndex: 0,
      },
      ...todos,
    ])
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

    const ordered = filterAndSortTodos(todos, 'active', '', 'manual')
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
    const now = Date.now()

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

    commitTodos([
      {
        id: `todo-${now}-${repeatIndex}`,
        text: task.text,
        priority: task.priority,
        difficulty: task.difficulty,
        rank: nextManualRank(),
        completed: false,
        active: !todos.some((todo) => todo.active && !todo.completed),
        requiredPomodoros: task.requiredPomodoros,
        completedPomodoros: 0,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        repeatOf: rootId,
        repeatIndex,
      },
      ...todos,
    ])
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

    const memory = syncTaskPomodoroMemory(
      task,
      timerSettings,
      taskPomodoroMemory[taskId],
    )

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
    const nextRun = typeof value === 'function' ? value(run) : value

    setPomodoroRun((current) => ({
      ...current,
      ...nextRun,
    }))

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

  const deleteTask = (taskId: string) => {
    const remaining = todos.filter((todo) => todo.id !== taskId)
    const activeExists = remaining.some((todo) => todo.active && !todo.completed)

    setTaskPomodoroMemory((current) => {
      const next = { ...current }
      delete next[taskId]
      return next
    })

    commitTodos(
      activeExists || remaining.length === 0
        ? remaining
        : filterAndSortTodos(remaining, 'active', '', 'manual').map((todo, index) => ({
            ...todo,
            active: index === 0 && !todo.completed,
          })),
    )
  }

  const completeFocusSession = useCallback(() => {
    recordActivity()

    if (!activeTask) {
      return
    }

    const beforeRemaining = activeTask.requiredPomodoros - activeTask.completedPomodoros
    updateTaskPomodoro(activeTask.id, 1, false)

    if (beforeRemaining <= 1) {
      setPomodoroRun((current) => ({
        ...current,
        targetPomodoros: Math.max(current.targetPomodoros, 1),
      }))
    }
  }, [activeTask, recordActivity, setPomodoroRun, updateTaskPomodoro])

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
        return (
          <TodoWidget
            copy={copy.todo}
            todos={todos}
            activeTaskId={activeTask?.id}
            isTimerRunning={timerRunning}
            onAddTask={addTask}
            onUpdateTask={updateTask}
            onToggleTask={toggleTask}
            onDeleteTask={deleteTask}
            onReorderTask={reorderTask}
            onRepeatTask={repeatTask}
            onSetActive={setTaskActive}
            onStartTaskTimer={startTaskTimer}
            onPauseTaskTimer={pauseTaskTimer}
          />
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
      <TopBar
        copy={copy}
        currentBackground={activeBackground.label}
        streak={streak}
        bestPomodoroRun={run.bestRun}
        totalStars={run.totalStars}
        starBurstKey={run.lastStarAt}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsPanel
        copy={copy.settings}
        isOpen={settingsOpen}
        language={language}
        widgetLabels={widgetLabels}
        layouts={layouts}
        streak={streak}
        timerSettings={timerSettings}
        memoryStatus={memoryStatus}
        memoryNotice={memoryNotice}
        backgroundDim={backgroundDim}
        particlesEnabled={particlesEnabled}
        onClose={() => setSettingsOpen(false)}
        onLanguageChange={setLanguageState}
        onResetLayout={resetLayout}
        onToggleWidget={toggleWidget}
        onDailyGoalChange={updateDailyGoal}
        onTimerSettingChange={updateTimerSetting}
        onBackgroundDimChange={setBackgroundDim}
        onParticlesEnabledChange={setParticlesEnabled}
        onExportData={exportData}
        onImportData={importData}
      />
      <Dock
        labels={widgetLabels}
        label={copy.dock.label}
        layouts={layouts}
        onToggle={toggleWidget}
        onFocus={focusWidget}
      />
      <main className="workspace" aria-label={copy.app.workspace}>
        {WIDGET_ORDER.map((id) => (
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
      </main>
    </div>
  )
}

export default App
