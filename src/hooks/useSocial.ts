import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  cancelFriendInvite,
  findFriendByCode,
  getFriendList,
  getFriendInvites,
  getFriendLeaderboard,
  getMyFriendProfile,
  regenerateFriendCode,
  respondFriendInvite,
  sendFriendInviteByCode,
  upsertUserSocialStats,
} from '../lib/social'
import type {
  AuthUserProfile,
  FriendCodeLookup,
  FriendInvite,
  FriendProfile,
  LeaderboardEntry,
  UserSocialStats,
} from '../types/app'

type UseSocialArgs = {
  client: SupabaseClient | null
  user: AuthUserProfile | null
  stats: Omit<UserSocialStats, 'userId' | 'updatedAt'> | null
}

const KNOWN_SOCIAL_ERROR_KEYS = [
  'cannot_invite_self',
  'friend_code_not_found',
  'invalid_invite_action',
  'invite_not_found',
  'missing_friend_code',
  'not_authenticated',
  'profile_not_found',
]

function rawSocialErrorMessage(error: unknown) {
  if (!error) {
    return ''
  }

  if (typeof error === 'string') {
    return error
  }

  const parts: string[] = []

  if (error instanceof Error) {
    parts.push(error.message)
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>

    for (const key of ['message', 'details', 'hint', 'code']) {
      const value = record[key]

      if (typeof value === 'string') {
        parts.push(value)
      }
    }
  }

  return parts.filter(Boolean).join(' ')
}

function socialErrorKey(error: unknown, fallback: string) {
  const raw = rawSocialErrorMessage(error)
  const normalized = raw.toLowerCase()

  for (const key of KNOWN_SOCIAL_ERROR_KEYS) {
    if (normalized.includes(key)) {
      return key
    }
  }

  if (
    /could not find the function|function .* does not exist|schema cache|pgrst20[24]|relation .* does not exist|column .* does not exist|permission denied|friend_invites|user_social_stats|friend_code|get_friend_|send_friend_invite|regenerate_friend_code/i.test(
      raw,
    )
  ) {
    return 'social_setup_required'
  }

  return fallback
}

export function useSocial({ client, user, stats }: UseSocialArgs) {
  const [profile, setProfile] = useState<FriendProfile | null>(null)
  const [friends, setFriends] = useState<FriendProfile[]>([])
  const [invites, setInvites] = useState<FriendInvite[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [lookup, setLookup] = useState<FriendCodeLookup | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const statsTimerRef = useRef<number>(0)

  const currentStats = useMemo<UserSocialStats | null>(() => {
    if (!user || !stats) {
      return null
    }

    return {
      userId: user.id,
      weekStart: stats.weekStart,
      weekStars: stats.weekStars,
      currentStreak: stats.currentStreak,
      weekRevisionsDone: stats.weekRevisionsDone,
      weekRevisionDailyAverage: stats.weekRevisionDailyAverage,
      totalStars: stats.totalStars,
      bestStreak: stats.bestStreak,
      bestRun: stats.bestRun,
      flameStages: stats.flameStages,
      flameQuests: stats.flameQuests,
      selectedFlameEffect: stats.selectedFlameEffect,
      updatedAt: null,
    }
  }, [stats, user])

  const refresh = useCallback(async () => {
    if (!client || !user) {
      setProfile(null)
      setFriends([])
      setInvites([])
      setLeaderboard([])
      setLookup(null)
      return
    }

    setLoading(true)

    let nextMessage = ''

    try {
      setProfile(await getMyFriendProfile(client, user.id))
    } catch (error) {
      setProfile(null)
      nextMessage = socialErrorKey(error, 'social_refresh_failed')
    }

    const [invitesResult, friendsResult, leaderboardResult] =
      await Promise.allSettled([
        getFriendInvites(client),
        getFriendList(client, user.id),
        getFriendLeaderboard(client, user.id),
      ])

    if (invitesResult.status === 'fulfilled') {
      setInvites(invitesResult.value)
    } else {
      setInvites([])
      nextMessage ||= socialErrorKey(invitesResult.reason, 'social_refresh_failed')
    }

    if (friendsResult.status === 'fulfilled') {
      setFriends(friendsResult.value)
    } else {
      setFriends([])
      nextMessage ||= socialErrorKey(friendsResult.reason, 'social_refresh_failed')
    }

    if (leaderboardResult.status === 'fulfilled') {
      setLeaderboard(leaderboardResult.value)
    } else {
      setLeaderboard([])
      nextMessage ||= socialErrorKey(leaderboardResult.reason, 'social_refresh_failed')
    }

    setMessage(nextMessage)
    setLoading(false)
  }, [client, user])

  useEffect(() => {
    window.setTimeout(() => {
      void refresh()
    }, 0)
  }, [refresh])

  useEffect(() => {
    window.clearTimeout(statsTimerRef.current)

    if (!client || !currentStats) {
      return
    }

    statsTimerRef.current = window.setTimeout(() => {
      void upsertUserSocialStats(client, currentStats)
        .then(refresh)
        .catch((error: unknown) =>
          setMessage(socialErrorKey(error, 'stats_sync_failed')),
        )
    }, 1_200)

    return () => window.clearTimeout(statsTimerRef.current)
  }, [client, currentStats, refresh])

  const searchFriendCode = useCallback(
    async (friendCode: string) => {
      if (!client || !user) {
        return
      }

      setLoading(true)
      try {
        const result = await findFriendByCode(client, friendCode)
        setLookup(result)
        setMessage('')
      } catch (error) {
        setLookup(null)
        setMessage(socialErrorKey(error, 'friend_lookup_failed'))
      } finally {
        setLoading(false)
      }
    },
    [client, user],
  )

  const sendInviteByCode = useCallback(
    async (friendCode: string) => {
      if (!client || !user) {
        return
      }

      setLoading(true)
      try {
        await sendFriendInviteByCode(client, friendCode)
        setMessage('invite_sent')
        setLookup(null)
        await refresh()
      } catch (error) {
        setMessage(socialErrorKey(error, 'invite_failed'))
      } finally {
        setLoading(false)
      }
    },
    [client, refresh, user],
  )

  const regenerateCode = useCallback(async () => {
    if (!client || !user) {
      return
    }

    setLoading(true)
    try {
      const nextProfile = await regenerateFriendCode(client, user.id)
      setProfile(nextProfile)
      setLookup(null)
      setMessage('friend_code_regenerated')
      await refresh()
    } catch (error) {
      setMessage(socialErrorKey(error, 'friend_code_failed'))
    } finally {
      setLoading(false)
    }
  }, [client, refresh, user])

  const acceptInvite = useCallback(
    async (inviteId: string) => {
      if (!client || !user) {
        return
      }

      setLoading(true)
      try {
        await respondFriendInvite(client, inviteId, 'accept')
        await refresh()
      } catch (error) {
        setMessage(socialErrorKey(error, 'invite_failed'))
      } finally {
        setLoading(false)
      }
    },
    [client, refresh, user],
  )

  const declineInvite = useCallback(
    async (inviteId: string) => {
      if (!client || !user) {
        return
      }

      setLoading(true)
      try {
        await respondFriendInvite(client, inviteId, 'decline')
        await refresh()
      } catch (error) {
        setMessage(socialErrorKey(error, 'invite_failed'))
      } finally {
        setLoading(false)
      }
    },
    [client, refresh, user],
  )

  const cancelInvite = useCallback(
    async (inviteId: string) => {
      if (!client || !user) {
        return
      }

      setLoading(true)
      try {
        await cancelFriendInvite(client, inviteId)
        await refresh()
      } catch (error) {
        setMessage(socialErrorKey(error, 'invite_failed'))
      } finally {
        setLoading(false)
      }
    },
    [client, refresh, user],
  )

  const profileWithCurrentStats = useMemo(() => {
    if (!profile || !currentStats || profile.userId !== currentStats.userId) {
      return profile
    }

    return {
      ...profile,
      ...currentStats,
      isSelf: true,
    }
  }, [currentStats, profile])

  const leaderboardWithCurrentStats = useMemo(() => {
    if (!currentStats) {
      return leaderboard
    }

    const merged = leaderboard.map((entry) =>
      entry.userId === currentStats.userId
        ? {
            ...entry,
            ...currentStats,
            isSelf: true,
          }
        : entry,
    )

    if (!merged.some((entry) => entry.userId === currentStats.userId)) {
      merged.push({
        ...currentStats,
        displayName: profile?.displayName ?? user?.displayName ?? 'Moi',
        avatarUrl: profile?.avatarUrl ?? user?.avatarUrl ?? '',
        isSelf: true,
        rank: 0,
      })
    }

    return merged
      .sort(
        (first, second) =>
          second.totalStars - first.totalStars ||
          second.weekStars - first.weekStars ||
          second.currentStreak - first.currentStreak ||
          second.weekRevisionDailyAverage - first.weekRevisionDailyAverage ||
          first.displayName.localeCompare(second.displayName),
      )
      .map((entry, index) => ({ ...entry, rank: index + 1 }))
  }, [currentStats, leaderboard, profile, user])

  return {
    profile: profileWithCurrentStats,
    friends,
    invites,
    leaderboard: leaderboardWithCurrentStats,
    lookup,
    loading,
    message,
    refresh,
    searchFriendCode,
    sendInviteByCode,
    regenerateCode,
    acceptInvite,
    declineInvite,
    cancelInvite,
    clearLookup: () => setLookup(null),
  }
}
