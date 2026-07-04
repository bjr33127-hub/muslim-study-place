import type {
  BaseFlameStage,
  FlameEvolutionState,
  FlameEvolutionUnlockCue,
  FlameQuestEffect,
  FlameQuestId,
  FlameUnlockKey,
  PomodoroRunState,
  SecretFlameStage,
  StreakDayRecord,
  StreakState,
  TodoItem,
} from '../types/app'
import { DEFAULT_FLAME_EVOLUTION } from './defaults'

export const SECRET_FLAME_STAGES: readonly SecretFlameStage[] = [
  'solar',
  'eclipse',
  'nebula',
  'apogee',
]

export const FLAME_QUEST_IDS: readonly FlameQuestId[] = [
  'perfect-week',
  'four-perfect-weeks',
  'twelve-focus-day',
  'hundred-stars',
  'ten-run',
  'deep-task',
  'twenty-five-tasks',
]

export const SECRET_STAGE_THRESHOLDS: Record<SecretFlameStage, number> = {
  solar: 120,
  eclipse: 150,
  nebula: 200,
  apogee: 300,
}

export const FLAME_QUEST_EFFECTS: Record<FlameQuestId, FlameQuestEffect> = {
  'perfect-week': 'seven-lights',
  'four-perfect-weeks': 'prismatic-halo',
  'twelve-focus-day': 'comet-trail',
  'hundred-stars': 'constellation',
  'ten-run': 'twin-rings',
  'deep-task': 'crystal-core',
  'twenty-five-tasks': 'runic-sparks',
}

export function getBaseFlameStage(current: number): BaseFlameStage {
  if (current >= 100) {
    return 'ultimate'
  }

  if (current >= 30) {
    return 'azure'
  }

  if (current >= 7) {
    return 'verdant'
  }

  return 'ember'
}

const VALID_EFFECTS = new Set<FlameQuestEffect>(
  Object.values(FLAME_QUEST_EFFECTS),
)

type FlameEvolutionProgress = {
  streak: StreakState
  run: PomodoroRunState
  todos: TodoItem[]
}

export type FlameEvolutionDiscovery = {
  state: FlameEvolutionState
  stages: SecretFlameStage[]
  quests: FlameQuestId[]
}

function cleanTimestamp(value: unknown) {
  const timestamp = Number(value)

  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
}

function cleanUnlockMap<T extends string>(
  value: unknown,
  validIds: readonly T[],
): Partial<Record<T, number>> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const source = value as Partial<Record<T, unknown>>

  return Object.fromEntries(
    validIds.flatMap((id) => {
      const timestamp = cleanTimestamp(source[id])

      return timestamp ? [[id, timestamp] as const] : []
    }),
  ) as Partial<Record<T, number>>
}

function parseDateKey(value: string) {
  const [year = '0', month = '1', day = '1'] = value.split('-')

  return new Date(Number(year), Number(month) - 1, Number(day))
}

function mondayKey(date: Date) {
  const monday = new Date(date)
  const offset = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - offset)

  return [
    monday.getFullYear(),
    String(monday.getMonth() + 1).padStart(2, '0'),
    String(monday.getDate()).padStart(2, '0'),
  ].join('-')
}

function countPerfectWeeks(history: Record<string, StreakDayRecord>) {
  const completedByWeek = new Map<string, Set<string>>()

  Object.values(history).forEach((day) => {
    if (!day.completed) {
      return
    }

    const key = mondayKey(parseDateKey(day.date))
    const days = completedByWeek.get(key) ?? new Set<string>()
    days.add(day.date)
    completedByWeek.set(key, days)
  })

  return Array.from(completedByWeek.values()).filter((days) => days.size === 7)
    .length
}

function questConditions({
  streak,
  run,
  todos,
}: FlameEvolutionProgress): Record<FlameQuestId, boolean> {
  const perfectWeeks = countPerfectWeeks(streak.history)
  const completedTodos = todos.filter((todo) => todo.completed)

  return {
    'perfect-week': perfectWeeks >= 1,
    'four-perfect-weeks': perfectWeeks >= 4,
    'twelve-focus-day': Object.values(streak.history).some(
      (day) => day.count >= 12,
    ),
    'hundred-stars': run.totalStars >= 100,
    'ten-run': run.bestRun >= 10,
    'deep-task': completedTodos.some((todo) => todo.requiredPomodoros >= 6),
    'twenty-five-tasks': completedTodos.length >= 25,
  }
}

function unlockKey(kind: 'stage' | 'quest', id: string) {
  return `${kind}:${id}` as FlameUnlockKey
}

function isUnlockKey(value: unknown): value is FlameUnlockKey {
  if (typeof value !== 'string') {
    return false
  }

  const [kind, id] = value.split(':')

  return kind === 'stage'
    ? SECRET_FLAME_STAGES.includes(id as SecretFlameStage)
    : kind === 'quest' && FLAME_QUEST_IDS.includes(id as FlameQuestId)
}

function normalizeHintMap(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, count]) => {
      if (!isUnlockKey(key)) {
        return []
      }

      const safeCount = Math.min(Math.max(Math.floor(Number(count) || 0), 0), 2)

      return safeCount ? [[key, safeCount] as const] : []
    }),
  ) as Partial<Record<FlameUnlockKey, number>>
}

export function parseFlameUnlockKeys(keys: readonly FlameUnlockKey[]) {
  const stages: SecretFlameStage[] = []
  const quests: FlameQuestId[] = []

  keys.forEach((key) => {
    const [kind, id] = key.split(':')

    if (kind === 'stage' && SECRET_FLAME_STAGES.includes(id as SecretFlameStage)) {
      stages.push(id as SecretFlameStage)
    } else if (kind === 'quest' && FLAME_QUEST_IDS.includes(id as FlameQuestId)) {
      quests.push(id as FlameQuestId)
    }
  })

  return { stages, quests }
}

export function normalizeFlameEvolution(
  value: Partial<FlameEvolutionState> | null | undefined,
): FlameEvolutionState {
  const stages = cleanUnlockMap<SecretFlameStage>(
    value?.stages,
    SECRET_FLAME_STAGES,
  )
  const quests = cleanUnlockMap<FlameQuestId>(
    value?.quests,
    FLAME_QUEST_IDS,
  )
  const selectedEffect =
    value?.selectedEffect && VALID_EFFECTS.has(value.selectedEffect)
      ? value.selectedEffect
      : null
  const selectedUnlocked = selectedEffect
    ? FLAME_QUEST_IDS.some(
        (quest) =>
          FLAME_QUEST_EFFECTS[quest] === selectedEffect && Boolean(quests[quest]),
      )
    : true
  const seenUnlocks = Array.from(
    new Set(
      Array.isArray(value?.seenUnlocks)
        ? value.seenUnlocks.filter((item): item is string => typeof item === 'string')
        : [],
    ),
  )
  const seenSet = new Set(seenUnlocks)
  const pendingUnlocks = Array.from(
    new Set(
      Array.isArray(value?.pendingUnlocks)
        ? value.pendingUnlocks.filter(isUnlockKey)
        : [],
    ),
  ).filter((key) => !seenSet.has(key))

  return {
    ...DEFAULT_FLAME_EVOLUTION,
    stages,
    quests,
    selectedEffect: selectedUnlocked ? selectedEffect : null,
    seenUnlocks,
    pendingUnlocks,
    revealedHints: normalizeHintMap(value?.revealedHints),
  }
}

export function discoverFlameEvolution(
  value: FlameEvolutionState,
  progress: FlameEvolutionProgress,
  now = Date.now(),
): FlameEvolutionDiscovery {
  const current = normalizeFlameEvolution(value)
  const stages = { ...current.stages }
  const quests = { ...current.quests }
  const seenUnlocks = new Set(current.seenUnlocks)
  const pendingUnlocks = new Set(current.pendingUnlocks)
  const discoveredStages: SecretFlameStage[] = []
  const discoveredQuests: FlameQuestId[] = []

  SECRET_FLAME_STAGES.forEach((stage) => {
    if (
      progress.streak.best < SECRET_STAGE_THRESHOLDS[stage] &&
      !stages[stage]
    ) {
      return
    }

    stages[stage] ||= now

    const key = unlockKey('stage', stage)
    if (!seenUnlocks.has(key) && !pendingUnlocks.has(key)) {
      pendingUnlocks.add(key)
      discoveredStages.push(stage)
    }
  })

  const conditions = questConditions(progress)
  FLAME_QUEST_IDS.forEach((quest) => {
    if (!conditions[quest] && !quests[quest]) {
      return
    }

    quests[quest] ||= now

    const key = unlockKey('quest', quest)
    if (!seenUnlocks.has(key) && !pendingUnlocks.has(key)) {
      pendingUnlocks.add(key)
      discoveredQuests.push(quest)
    }
  })

  const newestQuest = discoveredQuests.at(-1)

  return {
    state: {
      stages,
      quests,
      selectedEffect: newestQuest
        ? FLAME_QUEST_EFFECTS[newestQuest]
        : current.selectedEffect,
      seenUnlocks: Array.from(seenUnlocks),
      pendingUnlocks: Array.from(pendingUnlocks),
      revealedHints: current.revealedHints,
    },
    stages: discoveredStages,
    quests: discoveredQuests,
  }
}

export function buildPendingFlameEvolutionCue(
  state: FlameEvolutionState,
): FlameEvolutionUnlockCue | null {
  const normalized = normalizeFlameEvolution(state)

  if (!normalized.pendingUnlocks.length) {
    return null
  }

  const { stages, quests } = parseFlameUnlockKeys(normalized.pendingUnlocks)
  const timestamps = [
    ...stages.map((stage) => normalized.stages[stage] ?? 0),
    ...quests.map((quest) => normalized.quests[quest] ?? 0),
  ]

  return {
    key: Math.max(...timestamps, 1),
    stages,
    quests,
    claimKeys: normalized.pendingUnlocks,
  }
}

export function claimFlameEvolutionUnlocks(
  state: FlameEvolutionState,
  keys: readonly FlameUnlockKey[],
): FlameEvolutionState {
  const normalized = normalizeFlameEvolution(state)
  const claimed = new Set(keys.filter(isUnlockKey))

  return {
    ...normalized,
    pendingUnlocks: normalized.pendingUnlocks.filter((key) => !claimed.has(key)),
    seenUnlocks: Array.from(
      new Set([...normalized.seenUnlocks, ...Array.from(claimed)]),
    ),
  }
}

export function revealFlameAchievementHint(
  state: FlameEvolutionState,
  key: FlameUnlockKey,
): FlameEvolutionState {
  const normalized = normalizeFlameEvolution(state)
  const current = normalized.revealedHints[key] ?? 0

  return {
    ...normalized,
    revealedHints: {
      ...normalized.revealedHints,
      [key]: Math.min(current + 1, 2),
    },
  }
}

export function getActiveSecretFlameStage(
  state: FlameEvolutionState,
): SecretFlameStage | null {
  const normalized = normalizeFlameEvolution(state)

  return [...SECRET_FLAME_STAGES]
    .reverse()
    .find((stage) => Boolean(normalized.stages[stage])) ?? null
}

export function selectFlameQuestEffect(
  state: FlameEvolutionState,
  effect: FlameQuestEffect | null,
): FlameEvolutionState {
  const normalized = normalizeFlameEvolution(state)

  if (!effect) {
    return { ...normalized, selectedEffect: null }
  }

  const isUnlocked = FLAME_QUEST_IDS.some(
    (quest) =>
      FLAME_QUEST_EFFECTS[quest] === effect && Boolean(normalized.quests[quest]),
  )

  return {
    ...normalized,
    selectedEffect: isUnlocked ? effect : normalized.selectedEffect,
  }
}
