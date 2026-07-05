import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  FlameQuestEffect,
  FlameQuestId,
  FriendCodeLookup,
  FriendInvite,
  FriendInviteStatus,
  FriendProfile,
  LeaderboardEntry,
  SecretFlameStage,
  UserSocialStats,
} from '../types/app'
import {
  FLAME_QUEST_EFFECTS,
  FLAME_QUEST_IDS,
  SECRET_FLAME_STAGES,
} from './flameEvolution'

type FriendInviteRow = {
  id: string
  sender_id: string
  sender_display_name: string | null
  sender_avatar_url: string | null
  recipient_id: string | null
  recipient_display_name: string | null
  recipient_avatar_url: string | null
  status: FriendInviteStatus
  created_at: string
  updated_at: string
  responded_at: string | null
}

type LeaderboardRow = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  week_start: string
  week_stars: number | null
  current_streak: number | null
  week_revisions_done: number | null
  week_revision_daily_average?: number | string | null
  total_stars?: number | null
  best_streak?: number | null
  best_run?: number | null
  flame_stages?: string[] | null
  flame_quests?: string[] | null
  selected_flame_effect?: string | null
}

type FriendProfileRow = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  friend_code: string | null
  week_stars?: number | null
  current_streak?: number | null
  week_revisions_done?: number | null
  week_revision_daily_average?: number | string | null
  total_stars?: number | null
  best_streak?: number | null
  best_run?: number | null
  flame_stages?: string[] | null
  flame_quests?: string[] | null
  selected_flame_effect?: string | null
}

type FriendCodeLookupRow = FriendProfileRow & {
  relation: FriendCodeLookup['relation'] | null
}

function cleanInteger(value: unknown) {
  const number = Number(value)

  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0
}

function cleanDecimal(value: unknown) {
  const number = Number(value)

  return Number.isFinite(number) ? Math.max(0, Math.round(number * 10) / 10) : 0
}

function cleanFlameStages(value: unknown): SecretFlameStage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is SecretFlameStage =>
    SECRET_FLAME_STAGES.includes(item as SecretFlameStage),
  )
}

function cleanFlameQuests(value: unknown): FlameQuestId[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is FlameQuestId =>
    FLAME_QUEST_IDS.includes(item as FlameQuestId),
  )
}

function cleanFlameEffect(value: unknown): FlameQuestEffect | null {
  if (typeof value !== 'string') {
    return null
  }

  return Object.values(FLAME_QUEST_EFFECTS).includes(value as FlameQuestEffect)
    ? (value as FlameQuestEffect)
    : null
}

function inviteFromRow(row: FriendInviteRow): FriendInvite {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderDisplayName: row.sender_display_name ?? 'Ami',
    senderAvatarUrl: row.sender_avatar_url ?? '',
    recipientId: row.recipient_id,
    recipientDisplayName: row.recipient_display_name ?? 'Ami',
    recipientAvatarUrl: row.recipient_avatar_url ?? '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    respondedAt: row.responded_at,
  }
}

function profileFromRow(row: FriendProfileRow, userId: string): FriendProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name ?? 'Ami',
    avatarUrl: row.avatar_url ?? '',
    friendCode: row.friend_code ?? '',
    weekStars: cleanInteger(row.week_stars),
    currentStreak: cleanInteger(row.current_streak),
    weekRevisionsDone: cleanInteger(row.week_revisions_done),
    weekRevisionDailyAverage: cleanDecimal(row.week_revision_daily_average),
    totalStars: cleanInteger(row.total_stars),
    bestStreak: cleanInteger(row.best_streak),
    bestRun: cleanInteger(row.best_run),
    flameStages: cleanFlameStages(row.flame_stages),
    flameQuests: cleanFlameQuests(row.flame_quests),
    selectedFlameEffect: cleanFlameEffect(row.selected_flame_effect),
    isSelf: row.user_id === userId,
  }
}

function lookupFromRow(row: FriendCodeLookupRow): FriendCodeLookup {
  return {
    userId: row.user_id,
    displayName: row.display_name ?? 'Ami',
    avatarUrl: row.avatar_url ?? '',
    friendCode: row.friend_code ?? '',
    relation: row.relation ?? 'none',
  }
}

function leaderboardFromRows(rows: LeaderboardRow[], userId: string) {
  return rows
    .map((row): LeaderboardEntry => ({
      userId: row.user_id,
      displayName: row.display_name ?? 'Friend',
      avatarUrl: row.avatar_url ?? '',
      weekStart: row.week_start,
      weekStars: cleanInteger(row.week_stars),
      currentStreak: cleanInteger(row.current_streak),
      weekRevisionsDone: cleanInteger(row.week_revisions_done),
      weekRevisionDailyAverage: cleanDecimal(row.week_revision_daily_average),
      totalStars: cleanInteger(row.total_stars),
      bestStreak: cleanInteger(row.best_streak),
      bestRun: cleanInteger(row.best_run),
      flameStages: cleanFlameStages(row.flame_stages),
      flameQuests: cleanFlameQuests(row.flame_quests),
      selectedFlameEffect: cleanFlameEffect(row.selected_flame_effect),
      updatedAt: null,
      isSelf: row.user_id === userId,
      rank: 0,
    }))
    .sort(
      (first, second) =>
        second.totalStars - first.totalStars ||
        second.weekStars - first.weekStars ||
        second.currentStreak - first.currentStreak ||
        second.weekRevisionDailyAverage - first.weekRevisionDailyAverage ||
        first.displayName.localeCompare(second.displayName),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

export async function getMyFriendProfile(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .rpc('get_my_friend_code')
    .single<FriendProfileRow>()

  if (error) {
    throw error
  }

  return profileFromRow(data, userId)
}

export async function regenerateFriendCode(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .rpc('regenerate_friend_code')
    .single<FriendProfileRow>()

  if (error) {
    throw error
  }

  return profileFromRow(data, userId)
}

export async function upsertUserSocialStats(
  client: SupabaseClient,
  stats: UserSocialStats,
) {
  const { error } = await client.from('user_social_stats').upsert(
    {
      user_id: stats.userId,
      week_start: stats.weekStart,
      week_stars: stats.weekStars,
      current_streak: stats.currentStreak,
      week_revisions_done: stats.weekRevisionsDone,
      week_revision_daily_average: stats.weekRevisionDailyAverage,
      total_stars: stats.totalStars,
      best_streak: stats.bestStreak,
      best_run: stats.bestRun,
      flame_stages: stats.flameStages,
      flame_quests: stats.flameQuests,
      selected_flame_effect: stats.selectedFlameEffect,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    throw error
  }
}

export async function getFriendInvites(client: SupabaseClient) {
  const { data, error } = await client.rpc('get_friend_invites')

  if (error) {
    throw error
  }

  return ((data ?? []) as FriendInviteRow[]).map((row) => inviteFromRow(row))
}

export async function findFriendByCode(client: SupabaseClient, friendCode: string) {
  const { data, error } = await client
    .rpc('find_profile_by_friend_code', { p_friend_code: friendCode })
    .single<FriendCodeLookupRow>()

  if (error) {
    throw error
  }

  return lookupFromRow(data)
}

export async function sendFriendInviteByCode(
  client: SupabaseClient,
  friendCode: string,
) {
  const { data, error } = await client
    .rpc('send_friend_invite_by_code', { p_friend_code: friendCode })
    .single<FriendInviteRow>()

  if (error) {
    throw error
  }

  return inviteFromRow(data)
}

export async function getFriendList(client: SupabaseClient, userId: string) {
  const { data, error } = await client.rpc('get_friend_list')

  if (error) {
    throw error
  }

  return ((data ?? []) as FriendProfileRow[]).map((row) =>
    profileFromRow(row, userId),
  )
}

export async function respondFriendInvite(
  client: SupabaseClient,
  inviteId: string,
  action: 'accept' | 'decline',
) {
  const { data, error } = await client
    .rpc('respond_friend_invite', {
      p_invite_id: inviteId,
      p_action: action,
    })
    .single<FriendInviteRow>()

  if (error) {
    throw error
  }

  return inviteFromRow(data)
}

export async function cancelFriendInvite(client: SupabaseClient, inviteId: string) {
  const { data, error } = await client
    .rpc('cancel_friend_invite', { p_invite_id: inviteId })
    .single<FriendInviteRow>()

  if (error) {
    throw error
  }

  return inviteFromRow(data)
}

export async function getFriendLeaderboard(
  client: SupabaseClient,
  userId: string,
) {
  const { data, error } = await client.rpc('get_friend_leaderboard')

  if (error) {
    throw error
  }

  return leaderboardFromRows((data ?? []) as LeaderboardRow[], userId)
}
