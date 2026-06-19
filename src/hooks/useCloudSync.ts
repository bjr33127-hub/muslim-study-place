import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  CloudRevisionConflictError,
  downloadCloudSnapshot,
  durableToCloudSnapshot,
  getBrowserTimezone,
  getCloudAppState,
  getStoredCloudMeta,
  profileFromUser,
  saveCloudAppState,
  saveCloudStreakFromSnapshot,
  storePreMergeBackup,
  upsertCloudProfile,
  writeStoredCloudMeta,
} from '../lib/cloudSync'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient'
import {
  buildDurableSnapshot,
  importDurableSnapshot,
} from '../lib/storage'
import type { DurableStorageKey } from '../lib/storage'
import type {
  AuthUserProfile,
  CloudConflictState,
  CloudRemoteState,
  CloudSyncStatus,
} from '../types/app'

const SYNC_DEBOUNCE_MS = 900
const TIMER_CHECKPOINT_MS = 30_000
const FOCUS_SYNC_COOLDOWN_MS = 30_000
const HIGH_FREQUENCY_SYNC_KEYS = new Set<DurableStorageKey>([
  'timer:remaining',
  'taskPomodoroMemory',
])

type CloudSyncMode = 'automatic' | 'checkpoint' | 'manual' | 'recovery'

const SYNC_MODE_PRIORITY: Record<CloudSyncMode, number> = {
  checkpoint: 0,
  automatic: 1,
  recovery: 2,
  manual: 3,
}

function higherPriorityMode(
  current: CloudSyncMode | null,
  next: CloudSyncMode,
) {
  if (!current || SYNC_MODE_PRIORITY[next] > SYNC_MODE_PRIORITY[current]) {
    return next
  }

  return current
}

const SIGNED_OUT_STATUS: CloudSyncStatus = {
  configured: true,
  lastSyncedAt: null,
  phase: 'signed-out',
  revision: null,
}

const UNCONFIGURED_STATUS: CloudSyncStatus = {
  configured: false,
  lastSyncedAt: null,
  phase: 'unconfigured',
  revision: null,
}

function syncedStatus(remote: CloudRemoteState): CloudSyncStatus {
  return {
    configured: true,
    lastSyncedAt: remote.updatedAt ? Date.parse(remote.updatedAt) : Date.now(),
    phase: 'synced',
    revision: remote.revision,
  }
}

function snapshotsMatch(
  local: CloudRemoteState['snapshot'],
  remote: CloudRemoteState['snapshot'],
) {
  return JSON.stringify(local.values) === JSON.stringify(remote.values)
}

export function useCloudSync() {
  const client = useMemo(() => getSupabaseClient(), [])
  const configured = isSupabaseConfigured()
  const [user, setUser] = useState<AuthUserProfile | null>(null)
  const [status, setStatus] = useState<CloudSyncStatus>(
    configured ? SIGNED_OUT_STATUS : UNCONFIGURED_STATUS,
  )
  const [conflict, setConflict] = useState<CloudConflictState | null>(null)
  const userIdRef = useRef<string | null>(null)
  const revisionRef = useRef<number | null>(null)
  const automaticTimerRef = useRef<number>(0)
  const checkpointTimerRef = useRef<number>(0)
  const syncInFlightRef = useRef(false)
  const syncQueuedModeRef = useRef<CloudSyncMode | null>(null)
  const bootstrapInFlightRef = useRef(false)
  const conflictRef = useRef(false)
  const networkOfflineRef = useRef(!navigator.onLine)
  const lastFocusSyncAtRef = useRef(0)
  const lastSyncedSnapshotRef = useRef<CloudRemoteState['snapshot'] | null>(
    null,
  )
  const performSyncRef = useRef<(mode: CloudSyncMode) => Promise<void>>(
    async () => undefined,
  )

  const clearAutomaticTimer = useCallback(() => {
    window.clearTimeout(automaticTimerRef.current)
    automaticTimerRef.current = 0
  }, [])

  const clearCheckpointTimer = useCallback(() => {
    window.clearTimeout(checkpointTimerRef.current)
    checkpointTimerRef.current = 0
  }, [])

  const clearPendingSyncTimers = useCallback(() => {
    clearAutomaticTimer()
    clearCheckpointTimer()
  }, [clearAutomaticTimer, clearCheckpointTimer])

  const queueAutomaticSync = useCallback(() => {
    clearAutomaticTimer()
    clearCheckpointTimer()
    automaticTimerRef.current = window.setTimeout(() => {
      automaticTimerRef.current = 0
      void performSyncRef.current('automatic')
    }, SYNC_DEBOUNCE_MS)
  }, [clearAutomaticTimer, clearCheckpointTimer])

  const queueTimerCheckpoint = useCallback(() => {
    if (checkpointTimerRef.current) {
      return
    }

    checkpointTimerRef.current = window.setTimeout(() => {
      checkpointTimerRef.current = 0
      void performSyncRef.current('checkpoint')
    }, TIMER_CHECKPOINT_MS)
  }, [])

  const rememberSyncedRemote = useCallback((remote: CloudRemoteState) => {
    const userId = userIdRef.current

    if (!userId) {
      return
    }

    revisionRef.current = remote.revision
    lastSyncedSnapshotRef.current = remote.snapshot
    writeStoredCloudMeta(userId, remote.revision, remote.snapshot)
    setStatus(syncedStatus(remote))
  }, [])

  const performSync = useCallback(async (mode: CloudSyncMode) => {
    if (!client || !userIdRef.current || conflictRef.current) {
      return
    }

    if (!navigator.onLine) {
      networkOfflineRef.current = true
      setStatus((current) => ({
        ...current,
        phase: 'offline',
        message: 'offline',
      }))
      return
    }

    if (syncInFlightRef.current || bootstrapInFlightRef.current) {
      syncQueuedModeRef.current = higherPriorityMode(
        syncQueuedModeRef.current,
        mode,
      )

      if (mode === 'manual') {
        setStatus((current) => ({
          ...current,
          configured: true,
          phase: 'syncing',
        }))
      }
      return
    }

    clearPendingSyncTimers()
    syncQueuedModeRef.current = null
    syncInFlightRef.current = true

    if (mode === 'manual') {
      setStatus((current) => ({
        ...current,
        configured: true,
        phase: 'syncing',
      }))
    }

    try {
      const snapshot = durableToCloudSnapshot(await buildDurableSnapshot())
      const currentRemote = await getCloudAppState(client)

      if (currentRemote) {
        if (snapshotsMatch(snapshot, currentRemote.snapshot)) {
          rememberSyncedRemote(currentRemote)
          return
        }

        if (
          revisionRef.current !== null &&
          currentRemote.revision !== revisionRef.current
        ) {
          const lastSynced = lastSyncedSnapshotRef.current

          if (lastSynced && snapshotsMatch(lastSynced, currentRemote.snapshot)) {
            revisionRef.current = currentRemote.revision
          } else if (lastSynced && snapshotsMatch(lastSynced, snapshot)) {
            await importDurableSnapshot(currentRemote.snapshot)
            rememberSyncedRemote(currentRemote)
            window.location.reload()
            return
          } else {
            conflictRef.current = true
            setConflict({ local: snapshot, remote: currentRemote })
            storePreMergeBackup(snapshot)
            setStatus({
              configured: true,
              lastSyncedAt: currentRemote.updatedAt
                ? Date.parse(currentRemote.updatedAt)
                : null,
              phase: 'conflict',
              revision: currentRemote.revision,
            })
            return
          }
        }
      }

      const remote = await saveCloudAppState(
        client,
        snapshot,
        revisionRef.current,
      )

      rememberSyncedRemote(remote)
    } catch (error) {
      if (error instanceof CloudRevisionConflictError) {
        try {
          let remote = await getCloudAppState(client)
          const local = durableToCloudSnapshot(await buildDurableSnapshot())

          if (!remote) {
            throw error
          }

          if (snapshotsMatch(local, remote.snapshot)) {
            rememberSyncedRemote(remote)
            return
          }

          const lastSynced = lastSyncedSnapshotRef.current

          if (lastSynced && snapshotsMatch(lastSynced, remote.snapshot)) {
            try {
              const saved = await saveCloudAppState(
                client,
                local,
                remote.revision,
              )

              rememberSyncedRemote(saved)
              return
            } catch (retryError) {
              if (!(retryError instanceof CloudRevisionConflictError)) {
                throw retryError
              }

              remote = (await getCloudAppState(client)) ?? remote

              if (snapshotsMatch(local, remote.snapshot)) {
                rememberSyncedRemote(remote)
                return
              }
            }
          }

          conflictRef.current = true
          setConflict({ local, remote })
          storePreMergeBackup(local)
          setStatus({
            configured: true,
            lastSyncedAt: remote.updatedAt
              ? Date.parse(remote.updatedAt)
              : null,
            phase: 'conflict',
            revision: remote.revision,
          })
        } catch (recoveryError) {
          networkOfflineRef.current = !navigator.onLine
          setStatus((current) => ({
            ...current,
            configured: true,
            message:
              recoveryError instanceof Error
                ? recoveryError.message
                : 'sync_error',
            phase: navigator.onLine ? 'error' : 'offline',
          }))
        }
        return
      }

      networkOfflineRef.current = !navigator.onLine
      setStatus((current) => ({
        ...current,
        configured: true,
        message: error instanceof Error ? error.message : 'sync_error',
        phase: navigator.onLine ? 'error' : 'offline',
      }))
    } finally {
      syncInFlightRef.current = false

      const queuedMode = syncQueuedModeRef.current
      syncQueuedModeRef.current = null

      if (queuedMode && !conflictRef.current && userIdRef.current) {
        void performSyncRef.current(queuedMode)
      }
    }
  }, [
    clearPendingSyncTimers,
    client,
    rememberSyncedRemote,
  ])

  performSyncRef.current = performSync

  const scheduleStorageSync = useCallback((key?: DurableStorageKey) => {
    if (!client || !userIdRef.current || conflictRef.current) {
      return
    }

    if (key && HIGH_FREQUENCY_SYNC_KEYS.has(key)) {
      queueTimerCheckpoint()
      return
    }

    queueAutomaticSync()
  }, [client, queueAutomaticSync, queueTimerCheckpoint])

  const syncNow = useCallback(() => performSync('manual'), [performSync])

  const bootstrapSession = useCallback(async (session: Session | null) => {
    clearPendingSyncTimers()
    syncQueuedModeRef.current = null
    conflictRef.current = false
    setConflict(null)

    if (!client || !session?.user) {
      setUser(null)
      userIdRef.current = null
      revisionRef.current = null
      lastSyncedSnapshotRef.current = null
      setStatus(client ? SIGNED_OUT_STATUS : UNCONFIGURED_STATUS)
      return
    }

    const profile = profileFromUser(session.user)
    networkOfflineRef.current = !navigator.onLine
    setUser(profile)
    userIdRef.current = profile.id
    setStatus({
      configured: true,
      lastSyncedAt: null,
      phase: 'checking',
      revision: null,
    })
    bootstrapInFlightRef.current = true

    try {
      await upsertCloudProfile(client, session.user, getBrowserTimezone())
      const [remote, localDurable] = await Promise.all([
        getCloudAppState(client),
        buildDurableSnapshot(),
      ])
      const local = durableToCloudSnapshot(localDurable)

      if (!remote) {
        const saved = await saveCloudAppState(client, local, null)
        rememberSyncedRemote(saved)
        return
      }

      const storedMeta = getStoredCloudMeta()
      revisionRef.current = remote.revision
      lastSyncedSnapshotRef.current =
        storedMeta.userId === profile.id ? storedMeta.snapshot : null

      if (snapshotsMatch(local, remote.snapshot)) {
        rememberSyncedRemote(remote)
        return
      }

      if (
        storedMeta.userId === profile.id &&
        storedMeta.revision === remote.revision
      ) {
        lastSyncedSnapshotRef.current = remote.snapshot

        try {
          const saved = await saveCloudAppState(
            client,
            local,
            remote.revision,
          )

          rememberSyncedRemote(saved)
        } catch (error) {
          if (!(error instanceof CloudRevisionConflictError)) {
            throw error
          }

          syncQueuedModeRef.current = 'automatic'
        }
        return
      }

      if (
        storedMeta.userId === profile.id &&
        storedMeta.snapshot &&
        snapshotsMatch(storedMeta.snapshot, remote.snapshot)
      ) {
        lastSyncedSnapshotRef.current = remote.snapshot

        try {
          const saved = await saveCloudAppState(
            client,
            local,
            remote.revision,
          )

          rememberSyncedRemote(saved)
        } catch (error) {
          if (!(error instanceof CloudRevisionConflictError)) {
            throw error
          }

          syncQueuedModeRef.current = 'automatic'
        }
        return
      }

      if (
        storedMeta.userId === profile.id &&
        storedMeta.snapshot &&
        snapshotsMatch(storedMeta.snapshot, local)
      ) {
        await importDurableSnapshot(remote.snapshot)
        rememberSyncedRemote(remote)
        window.location.reload()
        return
      }

      conflictRef.current = true
      storePreMergeBackup(local)
      setConflict({ local, remote })
      setStatus({
        configured: true,
        lastSyncedAt: remote.updatedAt ? Date.parse(remote.updatedAt) : null,
        phase: 'conflict',
        revision: remote.revision,
      })
    } catch (error) {
      networkOfflineRef.current = !navigator.onLine
      setStatus({
        configured: true,
        lastSyncedAt: null,
        message: error instanceof Error ? error.message : 'cloud_unavailable',
        phase: navigator.onLine ? 'error' : 'offline',
        revision: null,
      })
    } finally {
      bootstrapInFlightRef.current = false

      const queuedMode = syncQueuedModeRef.current
      syncQueuedModeRef.current = null

      if (queuedMode && !conflictRef.current && userIdRef.current) {
        void performSyncRef.current(queuedMode)
      }
    }
  }, [
    clearPendingSyncTimers,
    client,
    rememberSyncedRemote,
  ])

  useEffect(() => {
    if (!client) {
      return undefined
    }

    let cancelled = false

    client.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) {
          void bootstrapSession(data.session)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus((current) => ({
            ...current,
            phase: 'error',
          }))
        }
      })

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
        return
      }

      if (event === 'SIGNED_IN') {
        if (session?.user.id === userIdRef.current) {
          setUser(profileFromUser(session.user))
          return
        }

        void bootstrapSession(session)
        return
      }

      if (event === 'USER_UPDATED' && session?.user) {
        setUser(profileFromUser(session.user))
        void upsertCloudProfile(
          client,
          session.user,
          getBrowserTimezone(),
        ).catch(() => undefined)
        return
      }

      if (event === 'SIGNED_OUT') {
        void bootstrapSession(null)
      }
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [bootstrapSession, client])

  useEffect(() => {
    const handleStorageChange = (event: Event) => {
      const key = (event as CustomEvent<{ key?: DurableStorageKey }>).detail?.key

      scheduleStorageSync(key)
    }
    const handleOffline = () => {
      networkOfflineRef.current = true
      clearPendingSyncTimers()

      if (userIdRef.current && !conflictRef.current) {
        setStatus((current) => ({
          ...current,
          message: 'offline',
          phase: 'offline',
        }))
      }
    }
    const handleOnline = () => {
      if (!networkOfflineRef.current) {
        return
      }

      networkOfflineRef.current = false
      lastFocusSyncAtRef.current = Date.now()
      void performSyncRef.current('recovery')
    }
    const handleFocus = () => {
      const now = Date.now()

      if (
        networkOfflineRef.current ||
        !navigator.onLine ||
        syncInFlightRef.current ||
        bootstrapInFlightRef.current ||
        now - lastFocusSyncAtRef.current < FOCUS_SYNC_COOLDOWN_MS
      ) {
        return
      }

      lastFocusSyncAtRef.current = now
      void performSyncRef.current('automatic')
    }

    window.addEventListener('msp:durable-storage-change', handleStorageChange)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('msp:durable-storage-change', handleStorageChange)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('focus', handleFocus)
      clearPendingSyncTimers()
    }
  }, [clearPendingSyncTimers, scheduleStorageSync])

  const signIn = useCallback(async () => {
    if (!client) {
      setStatus(UNCONFIGURED_STATUS)
      return
    }

    setStatus((current) => ({
      ...current,
      phase: 'checking',
    }))

    const { error } = await client.auth.signInWithOAuth({
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
      },
      provider: 'google',
    })

    if (error) {
      setStatus((current) => ({
        ...current,
        message: error.message,
        phase: 'error',
      }))
    }
  }, [client])

  const signOut = useCallback(async () => {
    if (!client) {
      return
    }

    await client.auth.signOut()
    setUser(null)
    userIdRef.current = null
    revisionRef.current = null
    lastSyncedSnapshotRef.current = null
    syncQueuedModeRef.current = null
    conflictRef.current = false
    clearPendingSyncTimers()
    setConflict(null)
    setStatus(SIGNED_OUT_STATUS)
  }, [clearPendingSyncTimers, client])

  const useCloudVersion = useCallback(async () => {
    if (!conflict || !userIdRef.current) {
      return
    }

    storePreMergeBackup(conflict.local)
    await importDurableSnapshot(conflict.remote.snapshot)
    writeStoredCloudMeta(
      userIdRef.current,
      conflict.remote.revision,
      conflict.remote.snapshot,
    )
    window.location.reload()
  }, [conflict])

  const useLocalVersion = useCallback(async () => {
    if (!client || !conflict || !userIdRef.current) {
      return
    }

    setStatus((current) => ({
      ...current,
      phase: 'syncing',
    }))

    try {
      await saveCloudStreakFromSnapshot(
        client,
        userIdRef.current,
        conflict.local,
      )
      const saved = await saveCloudAppState(client, conflict.local, null)

      conflictRef.current = false
      setConflict(null)
      rememberSyncedRemote(saved)
    } catch (error) {
      setStatus((current) => ({
        ...current,
        message: error instanceof Error ? error.message : 'sync_error',
        phase: 'error',
      }))
    }
  }, [client, conflict, rememberSyncedRemote])

  const exportLocalBackup = useCallback(() => {
    if (!conflict) {
      return
    }

    downloadCloudSnapshot(conflict.local, 'muslim-study-place-local-backup')
  }, [conflict])

  return {
    client,
    conflict,
    exportLocalBackup,
    isConfigured: configured,
    signIn,
    signOut,
    status,
    syncNow,
    useCloudVersion,
    useLocalVersion,
    user,
  }
}
