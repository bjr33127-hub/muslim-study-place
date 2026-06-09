import {
  BookOpen,
  CheckSquare,
  AudioLines,
  Image,
  NotebookPen,
  Timer,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BackgroundLayer } from './components/layout/BackgroundLayer'
import { Dock } from './components/layout/Dock'
import { SettingsPanel } from './components/layout/SettingsPanel'
import { TopBar } from './components/layout/TopBar'
import { WidgetFrame } from './components/layout/WidgetFrame'
import { BackgroundsWidget } from './components/widgets/BackgroundsWidget'
import { NotesWidget } from './components/widgets/NotesWidget'
import { PomodoroWidget } from './components/widgets/PomodoroWidget'
import { QuranPlayerWidget } from './components/widgets/QuranPlayerWidget'
import { SpotifyWidget } from './components/widgets/SpotifyWidget'
import { TodoWidget } from './components/widgets/TodoWidget'
import { YoutubeWidget } from './components/widgets/YoutubeWidget'
import { usePersistentState } from './hooks/usePersistentState'
import {
  BUILT_IN_BACKGROUNDS,
  DEFAULT_LAYOUTS,
  DEFAULT_POMODORO_RUN,
  DEFAULT_STREAK,
  DEFAULT_TIMER_SETTINGS,
  WIDGET_LABELS,
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
import { clampPomodoros, normalizeTodos, seedTodos } from './lib/todos'
import { publicPath } from './lib/publicPath'
import type {
  BackgroundAsset,
  PomodoroRunState,
  TaskPomodoroMemory,
  TimerSettings,
  TimerMode,
  TodoItem,
  WidgetId,
  WidgetLayout,
} from './types/app'

const widgetIcons: Record<WidgetId, ReactNode> = {
  pomodoro: <Timer size={18} strokeWidth={1.8} />,
  todo: <CheckSquare size={18} strokeWidth={1.8} />,
  notes: <NotebookPen size={18} strokeWidth={1.8} />,
  quran: <AudioLines size={18} strokeWidth={1.8} />,
  spotify: <BookOpen size={18} strokeWidth={1.8} />,
  youtube: <Video size={18} strokeWidth={1.8} />,
  backgrounds: <Image size={18} strokeWidth={1.8} />,
}

function createTaskPomodoroMemory(
  task: TodoItem,
  timerSettings: TimerSettings,
): TaskPomodoroMemory {
  return {
    mode: 'focus',
    remaining: timerSeconds('focus', timerSettings),
    targetPomodoros: clampPomodoros(
      task.requiredPomodoros - task.completedPomodoros,
    ),
    completedInTarget: 0,
    currentRun: 0,
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
  const run = useMemo(
    () => ({
      ...DEFAULT_POMODORO_RUN,
      ...pomodoroRun,
      ...(activeTaskMemory
        ? {
            targetPomodoros: activeTaskMemory.targetPomodoros,
            completedInTarget: activeTaskMemory.completedInTarget,
            currentRun: activeTaskMemory.currentRun,
          }
        : {}),
    }),
    [activeTaskMemory, pomodoroRun],
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

  useEffect(() => {
    if (layoutVersion < 5) {
      setLayouts(DEFAULT_LAYOUTS)
      setLayoutVersion(5)
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
      setUploadError('Only image and video backgrounds are supported.')
      return
    }

    try {
      const saved = await Promise.all(uploadableFiles.map(saveUploadedBackground))
      setUploadVersion((version) => version + 1)

      if (saved[0]) {
        setSelectedBackgroundId(saved[0].id)
      }
    } catch {
      setUploadError('Upload could not be saved in this browser.')
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
      setUploadError('Background could not be deleted.')
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
        ...(current[activeTask.id] ??
          createTaskPomodoroMemory(activeTask, nextSettings)),
        mode: timerMode,
        remaining: nextRemaining,
      },
    }))
  }

  const resetLayout = () => {
    setLayouts(DEFAULT_LAYOUTS)
  }

  const addTask = (text: string, requiredPomodoros: number) => {
    commitTodos([
      {
        id: `todo-${Date.now()}`,
        text,
        completed: false,
        active: todos.length === 0,
        requiredPomodoros: clampPomodoros(requiredPomodoros),
        completedPomodoros: 0,
        createdAt: Date.now(),
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

    const memory =
      taskPomodoroMemory[taskId] ?? createTaskPomodoroMemory(task, timerSettings)

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

        return {
          ...todo,
          completed: delta > 0 ? todo.completed : false,
          completedPomodoros: Math.min(
            Math.max(todo.completedPomodoros + delta, 0),
            todo.requiredPomodoros,
          ),
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

    const nextRequired = clampPomodoros(
      Math.max(activeTask.completedPomodoros + nextTarget, activeTask.completedPomodoros + 1),
    )

    commitTodos(
      todos.map((todo) => {
        if (todo.id !== activeTask.id) {
          return todo
        }

        return {
          ...todo,
          requiredPomodoros: nextRequired,
          completed: todo.completedPomodoros >= nextRequired,
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
        : remaining.map((todo, index) => ({
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
            onFocusComplete={completeFocusSession}
          />
        )
      case 'todo':
        return (
          <TodoWidget
            todos={todos}
            activeTaskId={activeTask?.id}
            isTimerRunning={timerRunning}
            onAddTask={addTask}
            onToggleTask={toggleTask}
            onDeleteTask={deleteTask}
            onSetActive={setTaskActive}
            onStartTaskTimer={startTaskTimer}
            onPauseTaskTimer={pauseTaskTimer}
          />
        )
      case 'notes':
        return <NotesWidget />
      case 'quran':
        return <QuranPlayerWidget />
      case 'spotify':
        return <SpotifyWidget />
      case 'youtube':
        return <YoutubeWidget />
      case 'backgrounds':
        return (
          <BackgroundsWidget
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
        currentBackground={activeBackground.label}
        streak={streak}
        bestPomodoroRun={run.bestRun}
        totalStars={run.totalStars}
        starBurstKey={run.lastStarAt}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsPanel
        isOpen={settingsOpen}
        layouts={layouts}
        streak={streak}
        timerSettings={timerSettings}
        backgroundDim={backgroundDim}
        particlesEnabled={particlesEnabled}
        onClose={() => setSettingsOpen(false)}
        onResetLayout={resetLayout}
        onToggleWidget={toggleWidget}
        onDailyGoalChange={updateDailyGoal}
        onTimerSettingChange={updateTimerSetting}
        onBackgroundDimChange={setBackgroundDim}
        onParticlesEnabledChange={setParticlesEnabled}
      />
      <Dock layouts={layouts} onToggle={toggleWidget} onFocus={focusWidget} />
      <main className="workspace" aria-label="Study dashboard">
        {WIDGET_ORDER.map((id) => (
          <WidgetFrame
            key={id}
            title={WIDGET_LABELS[id]}
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
