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
import type {
  AuthUserProfile,
  CloudConflictState,
  CloudRemoteState,
  CloudSyncStatus,
} from '../types/app'

const SYNC_DEBOUNCE_MS = 900

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
  const timerRef = useRef<number>(0)
  const syncInFlightRef = useRef(false)
  const syncQueuedRef = useRef(false)
  const bootstrapInFlightRef = useRef(false)
  const conflictRef = useRef(false)
  const lastSyncedSnapshotRef = useRef<CloudRemoteState['snapshot'] | null>(
    null,
  )
  const syncNowRef = useRef<() => Promise<void>>(async () => undefined)

  const clearSyncTimer = useCallback(() => {
    window.clearTimeout(timerRef.current)
    timerRef.current = 0
  }, [])

  const queueSync = useCallback(() => {
    clearSyncTimer()
    timerRef.current = window.setTimeout(() => {
      void syncNowRef.current()
    }, SYNC_DEBOUNCE_MS)
  }, [clearSyncTimer])

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

  const syncNow = useCallback(async () => {
    if (!client || !userIdRef.current || conflictRef.current) {
      return
    }

    if (!navigator.onLine) {
      setStatus((current) => ({
        ...current,
        phase: 'offline',
        message: 'offline',
      }))
      return
    }

    if (syncInFlightRef.current || bootstrapInFlightRef.current) {
      syncQueuedRef.current = true
      return
    }

    syncQueuedRef.current = false
    syncInFlightRef.current = true
    setStatus((current) => ({
      ...current,
      configured: true,
      phase: 'syncing',
    }))

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

      setStatus((current) => ({
        ...current,
        configured: true,
        message: error instanceof Error ? error.message : 'sync_error',
        phase: navigator.onLine ? 'error' : 'offline',
      }))
    } finally {
      syncInFlightRef.current = false

      if (
        syncQueuedRef.current &&
        !conflictRef.current &&
        userIdRef.current
      ) {
        syncQueuedRef.current = false
        queueSync()
      }
    }
  }, [client, queueSync, rememberSyncedRemote])

  syncNowRef.current = syncNow

  const scheduleSync = useCallback(() => {
    if (!client || !userIdRef.current || conflictRef.current) {
      return
    }

    if (syncInFlightRef.current || bootstrapInFlightRef.current) {
      syncQueuedRef.current = true
      return
    }

    queueSync()
  }, [client, queueSync])

  const bootstrapSession = useCallback(async (session: Session | null) => {
    clearSyncTimer()
    syncQueuedRef.current = false
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

          syncQueuedRef.current = true
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

          syncQueuedRef.current = true
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
      setStatus({
        configured: true,
        lastSyncedAt: null,
        message: error instanceof Error ? error.message : 'cloud_unavailable',
        phase: navigator.onLine ? 'error' : 'offline',
        revision: null,
      })
    } finally {
      bootstrapInFlightRef.current = false

      if (
        syncQueuedRef.current &&
        !conflictRef.current &&
        userIdRef.current
      ) {
        syncQueuedRef.current = false
        queueSync()
      }
    }
  }, [clearSyncTimer, client, queueSync, rememberSyncedRemote])

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
    const handleStorageChange = () => scheduleSync()
    const handleOnline = () => void syncNowRef.current()

    window.addEventListener('msp:durable-storage-change', handleStorageChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('focus', handleOnline)

    return () => {
      window.removeEventListener('msp:durable-storage-change', handleStorageChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('focus', handleOnline)
      clearSyncTimer()
    }
  }, [clearSyncTimer, scheduleSync])

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
    syncQueuedRef.current = false
    conflictRef.current = false
    setConflict(null)
    setStatus(SIGNED_OUT_STATUS)
  }, [client])

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
