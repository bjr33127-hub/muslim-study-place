import type { SupabaseClient, User } from '@supabase/supabase-js'
import type {
  AuthUserProfile,
  CloudRemoteState,
  CloudSnapshot,
  StreakState,
} from '../types/app'
import { normalizeStreak } from './streak'
import { fullStorageKey, type DurableSnapshot } from './storage'

export const CLOUD_LAST_USER_KEY = 'cloud:lastUserId'
export const CLOUD_LAST_REVISION_KEY = 'cloud:lastRevision'
export const CLOUD_LAST_SNAPSHOT_KEY = 'cloud:lastSnapshot'
export const CLOUD_PRE_MERGE_BACKUP_KEY = 'cloud:preMergeBackup'

type AppStateRow = {
  snapshot: unknown
  revision: number
  updated_at: string | null
}

type SaveAppStateRow = {
  snapshot: unknown
  revision: number
  updated_at: string | null
}

export class CloudRevisionConflictError extends Error {
  constructor() {
    super('Cloud revision conflict.')
    this.name = 'CloudRevisionConflictError'
  }
}

function safeLocalStorageSet(key: string, value: unknown) {
  try {
    window.localStorage.setItem(fullStorageKey(key), JSON.stringify(value))
  } catch {
    // Cloud metadata is a convenience cache; sync still works without it.
  }
}

function safeLocalStorageGet<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(fullStorageKey(key))
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'
  } catch {
    return 'Europe/Paris'
  }
}

export function getStoredCloudMeta() {
  return {
    userId: safeLocalStorageGet<string>(CLOUD_LAST_USER_KEY),
    revision: safeLocalStorageGet<number>(CLOUD_LAST_REVISION_KEY),
    snapshot: normalizeCloudSnapshot(
      safeLocalStorageGet<unknown>(CLOUD_LAST_SNAPSHOT_KEY),
    ),
  }
}

export function writeStoredCloudMeta(
  userId: string,
  revision: number,
  snapshot?: CloudSnapshot,
) {
  safeLocalStorageSet(CLOUD_LAST_USER_KEY, userId)
  safeLocalStorageSet(CLOUD_LAST_REVISION_KEY, revision)

  if (snapshot) {
    safeLocalStorageSet(CLOUD_LAST_SNAPSHOT_KEY, snapshot)
  }
}

export function storePreMergeBackup(snapshot: CloudSnapshot) {
  safeLocalStorageSet(CLOUD_PRE_MERGE_BACKUP_KEY, {
    ...snapshot,
    exportedAt: new Date().toISOString(),
  })
}

export function durableToCloudSnapshot(snapshot: DurableSnapshot): CloudSnapshot {
  return {
    app: snapshot.app,
    version: snapshot.version,
    exportedAt: snapshot.exportedAt,
    values: { ...snapshot.values },
  }
}

export function normalizeCloudSnapshot(value: unknown): CloudSnapshot | null {
  const snapshot = value as Partial<CloudSnapshot>

  if (
    snapshot?.app !== 'muslim-study-place' ||
    snapshot.version !== 1 ||
    !snapshot.values ||
    typeof snapshot.values !== 'object'
  ) {
    return null
  }

  return {
    app: 'muslim-study-place',
    version: 1,
    exportedAt:
      typeof snapshot.exportedAt === 'string'
        ? snapshot.exportedAt
        : new Date().toISOString(),
    values: { ...snapshot.values },
  }
}

export function profileFromUser(user: User): AuthUserProfile {
  const metadata = user.user_metadata ?? {}
  const displayName =
    typeof metadata.full_name === 'string' && metadata.full_name.trim()
      ? metadata.full_name
      : typeof metadata.name === 'string' && metadata.name.trim()
        ? metadata.name
        : user.email?.split('@')[0] ?? 'Google'
  const avatarUrl =
    typeof metadata.avatar_url === 'string' ? metadata.avatar_url : ''

  return {
    id: user.id,
    email: user.email ?? '',
    displayName,
    avatarUrl,
  }
}

export async function upsertCloudProfile(
  client: SupabaseClient,
  user: User,
  timezone = getBrowserTimezone(),
) {
  const profile = profileFromUser(user)
  const { error } = await client.from('profiles').upsert(
    {
      id: profile.id,
      email: profile.email,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
      timezone,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (error) {
    throw error
  }

  return profile
}

export async function getCloudAppState(
  client: SupabaseClient,
): Promise<CloudRemoteState | null> {
  const { data, error } = await client
    .from('user_app_state')
    .select('snapshot, revision, updated_at')
    .maybeSingle<AppStateRow>()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  const snapshot = normalizeCloudSnapshot(data.snapshot)

  if (!snapshot) {
    return null
  }

  return {
    snapshot,
    revision: Number(data.revision) || 0,
    updatedAt: data.updated_at,
  }
}

export async function saveCloudAppState(
  client: SupabaseClient,
  snapshot: CloudSnapshot,
  expectedRevision: number | null,
): Promise<CloudRemoteState> {
  const { data, error } = await client
    .rpc('save_app_state', {
      p_expected_revision: expectedRevision,
      p_snapshot: snapshot,
    })
    .single<SaveAppStateRow>()

  if (error) {
    if (error.message?.includes('revision_conflict')) {
      throw new CloudRevisionConflictError()
    }

    throw error
  }

  const normalized = normalizeCloudSnapshot(data.snapshot) ?? snapshot

  return {
    snapshot: normalized,
    revision: Number(data.revision) || 0,
    updatedAt: data.updated_at,
  }
}

export async function saveCloudStreakFromSnapshot(
  client: SupabaseClient,
  userId: string,
  snapshot: CloudSnapshot,
) {
  const streakValue = snapshot.values.streak as Partial<StreakState> | undefined

  if (!streakValue) {
    return null
  }

  const streak = normalizeStreak(streakValue)
  const { error } = await client.from('user_streaks').upsert(
    {
      user_id: userId,
      current: streak.current,
      best: Math.max(streak.best, streak.current),
      last_active_date: streak.lastActiveDate,
      today_count: streak.todayCount,
      daily_goal: streak.dailyGoal,
      history: streak.history,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    throw error
  }

  return streak
}

async function runStreakRpc(
  client: SupabaseClient,
  name: 'record_daily_check_in' | 'record_streak_activity' | 'set_daily_goal',
  args: Record<string, unknown>,
): Promise<StreakState> {
  const { data, error } = await client.rpc(name, args)

  if (error) {
    throw error
  }

  return normalizeStreak(data as Partial<StreakState>)
}

export function recordCloudDailyCheckIn(client: SupabaseClient) {
  return runStreakRpc(client, 'record_daily_check_in', {
    p_timezone: getBrowserTimezone(),
  })
}

export function recordCloudStreakActivity(client: SupabaseClient) {
  return runStreakRpc(client, 'record_streak_activity', {
    p_timezone: getBrowserTimezone(),
  })
}

export function setCloudStreakDailyGoal(
  client: SupabaseClient,
  dailyGoal: number,
) {
  return runStreakRpc(client, 'set_daily_goal', {
    p_daily_goal: dailyGoal,
    p_timezone: getBrowserTimezone(),
  })
}

export function downloadCloudSnapshot(snapshot: CloudSnapshot, prefix: string) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
