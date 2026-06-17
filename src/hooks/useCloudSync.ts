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
  const conflictRef = useRef(false)

  const clearSyncTimer = useCallback(() => {
    window.clearTimeout(timerRef.current)
    timerRef.current = 0
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

    if (syncInFlightRef.current) {
      return
    }

    syncInFlightRef.current = true
    setStatus((current) => ({
      ...current,
      configured: true,
      phase: 'syncing',
    }))

    try {
      const snapshot = durableToCloudSnapshot(await buildDurableSnapshot())
      const remote = await saveCloudAppState(
        client,
        snapshot,
        revisionRef.current,
      )

      revisionRef.current = remote.revision
      writeStoredCloudMeta(userIdRef.current, remote.revision)
      setStatus(syncedStatus(remote))
    } catch (error) {
      if (error instanceof CloudRevisionConflictError) {
        const remote = await getCloudAppState(client)
        const local = durableToCloudSnapshot(await buildDurableSnapshot())

        if (remote) {
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
    }
  }, [client])

  const scheduleSync = useCallback(() => {
    if (!client || !userIdRef.current || conflictRef.current) {
      return
    }

    clearSyncTimer()
    timerRef.current = window.setTimeout(() => {
      void syncNow()
    }, SYNC_DEBOUNCE_MS)
  }, [clearSyncTimer, client, syncNow])

  const bootstrapSession = useCallback(async (session: Session | null) => {
    clearSyncTimer()
    conflictRef.current = false
    setConflict(null)

    if (!client || !session?.user) {
      setUser(null)
      userIdRef.current = null
      revisionRef.current = null
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

    try {
      await upsertCloudProfile(client, session.user, getBrowserTimezone())
      const [remote, localDurable] = await Promise.all([
        getCloudAppState(client),
        buildDurableSnapshot(),
      ])
      const local = durableToCloudSnapshot(localDurable)

      if (!remote) {
        const saved = await saveCloudAppState(client, local, null)
        revisionRef.current = saved.revision
        writeStoredCloudMeta(profile.id, saved.revision)
        setStatus(syncedStatus(saved))
        return
      }

      const storedMeta = getStoredCloudMeta()
      revisionRef.current = remote.revision

      if (
        storedMeta.userId === profile.id &&
        storedMeta.revision === remote.revision
      ) {
        if (!snapshotsMatch(local, remote.snapshot)) {
          conflictRef.current = true
          storePreMergeBackup(local)
          setConflict({ local, remote })
          setStatus({
            configured: true,
            lastSyncedAt: remote.updatedAt ? Date.parse(remote.updatedAt) : null,
            phase: 'conflict',
            revision: remote.revision,
          })
          return
        }

        setStatus(syncedStatus(remote))
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
    }
  }, [clearSyncTimer, client])

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

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        void bootstrapSession(session)
      }
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [bootstrapSession, client])

  useEffect(() => {
    const handleStorageChange = () => scheduleSync()
    const handleOnline = () => void syncNow()

    window.addEventListener('msp:durable-storage-change', handleStorageChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('focus', handleOnline)

    return () => {
      window.removeEventListener('msp:durable-storage-change', handleStorageChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('focus', handleOnline)
      clearSyncTimer()
    }
  }, [clearSyncTimer, scheduleSync, syncNow])

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
    writeStoredCloudMeta(userIdRef.current, conflict.remote.revision)
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

      revisionRef.current = saved.revision
      writeStoredCloudMeta(userIdRef.current, saved.revision)
      conflictRef.current = false
      setConflict(null)
      setStatus(syncedStatus(saved))
    } catch (error) {
      setStatus((current) => ({
        ...current,
        message: error instanceof Error ? error.message : 'sync_error',
        phase: 'error',
      }))
    }
  }, [client, conflict])

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
