import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Download,
  LogOut,
  RefreshCw,
  UploadCloud,
  UserCircle,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AppCopy } from '../../lib/i18n'
import type {
  AuthUserProfile,
  CloudConflictState,
  CloudSnapshot,
  CloudSyncStatus,
} from '../../types/app'

type AccountMenuProps = {
  copy: AppCopy['account']
  user: AuthUserProfile | null
  status: CloudSyncStatus
  conflict: CloudConflictState | null
  onSignIn: () => void
  onSignOut: () => void
  onSyncNow: () => void
  onUseCloudVersion: () => void
  onUseLocalVersion: () => void
  onExportLocalBackup: () => void
}

function statusLabel(copy: AppCopy['account'], status: CloudSyncStatus) {
  switch (status.phase) {
    case 'unconfigured':
      return copy.unconfigured
    case 'signed-out':
      return copy.signedOut
    case 'checking':
      return copy.checking
    case 'conflict':
      return copy.conflict
    case 'syncing':
      return copy.syncing
    case 'synced':
      return copy.synced
    case 'offline':
      return copy.offline
    case 'error':
      return copy.error
  }
}

function StatusIcon({ phase }: { phase: CloudSyncStatus['phase'] }) {
  if (phase === 'synced') {
    return <CheckCircle2 size={15} strokeWidth={1.9} />
  }

  if (phase === 'offline' || phase === 'unconfigured') {
    return <CloudOff size={15} strokeWidth={1.9} />
  }

  if (phase === 'conflict' || phase === 'error') {
    return <AlertTriangle size={15} strokeWidth={1.9} />
  }

  if (phase === 'syncing' || phase === 'checking') {
    return <RefreshCw size={15} strokeWidth={1.9} />
  }

  return <Cloud size={15} strokeWidth={1.9} />
}

type SnapshotSummary = {
  updatedMs: number
  updatedLabel: string
  taskCount: number
  stars: number
  streak: number
}

function arrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

function objectNumber(value: unknown, key: string) {
  return typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[key] === 'number'
    ? ((value as Record<string, number>)[key] ?? 0)
    : 0
}

function summarizeSnapshot(
  copy: AppCopy['account'],
  snapshot: CloudSnapshot,
  updatedAt?: string | null,
): SnapshotSummary {
  const values = snapshot.values
  const exportedAt = updatedAt ?? snapshot.exportedAt
  const updatedMs = Date.parse(exportedAt) || 0
  const pomodoroRun = values.pomodoroRun
  const streak = values.streak

  return {
    updatedMs,
    updatedLabel: updatedMs
      ? new Date(updatedMs).toLocaleString()
      : copy.unknownDate,
    taskCount: arrayCount(values.todos),
    stars: objectNumber(pomodoroRun, 'totalStars'),
    streak: objectNumber(streak, 'current'),
  }
}

export function AccountMenu({
  copy,
  user,
  status,
  conflict,
  onSignIn,
  onSignOut,
  onSyncNow,
  onUseCloudVersion,
  onUseLocalVersion,
  onExportLocalBackup,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const [failedAvatarSource, setFailedAvatarSource] = useState('')
  const shellRef = useRef<HTMLDivElement | null>(null)
  const label = statusLabel(copy, status)
  const conflictLocal = conflict
    ? summarizeSnapshot(copy, conflict.local)
    : null
  const conflictCloud = conflict
    ? summarizeSnapshot(copy, conflict.remote.snapshot, conflict.remote.updatedAt)
    : null
  const cloudRecommended =
    Boolean(conflictCloud && conflictLocal) &&
    (conflictCloud?.updatedMs ?? 0) >= (conflictLocal?.updatedMs ?? 0)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <div
      ref={shellRef}
      className={`account-shell is-${status.phase}${open ? ' is-open' : ''}`}
    >
      <button
        className="account-button"
        type="button"
        aria-label={copy.open}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="account-avatar" aria-hidden="true">
          {user?.avatarUrl && failedAvatarSource !== user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              onError={() => setFailedAvatarSource(user.avatarUrl)}
            />
          ) : (
            <UserCircle size={19} strokeWidth={1.75} />
          )}
        </span>
        <span className="account-copy">
          <strong>{user ? user.displayName : copy.connect}</strong>
          <small>{label}</small>
        </span>
        <span className="account-status-icon" aria-hidden="true">
          <StatusIcon phase={status.phase} />
        </span>
      </button>

      {open ? (
        <div className="account-popover" role="dialog" aria-label={copy.panelTitle}>
          <div className="account-popover-head">
            <span className="account-status-icon" aria-hidden="true">
              <StatusIcon phase={status.phase} />
            </span>
            <div>
              <strong>{label}</strong>
              <small>
                {user?.email || (status.configured ? copy.googleOnly : copy.envHint)}
              </small>
            </div>
          </div>

          {status.phase === 'unconfigured' ? (
            <p className="account-hint">{copy.setupHint}</p>
          ) : null}

          {conflict ? (
            <div className="account-conflict">
              <p>{copy.conflictHint}</p>
              <div className="account-conflict-grid">
                {conflictCloud ? (
                  <article
                    className={`account-conflict-card${cloudRecommended ? ' is-recommended' : ''}`}
                  >
                    <span>{copy.cloudBackup}</span>
                    {cloudRecommended ? <em>{copy.recommended}</em> : null}
                    <strong>{copy.updated(conflictCloud.updatedLabel)}</strong>
                    <small>{copy.taskCount(conflictCloud.taskCount)}</small>
                    <small>{copy.starCount(conflictCloud.stars)}</small>
                    <small>{copy.streakCount(conflictCloud.streak)}</small>
                  </article>
                ) : null}
                {conflictLocal ? (
                  <article
                    className={`account-conflict-card${!cloudRecommended ? ' is-recommended' : ''}`}
                  >
                    <span>{copy.localBackup}</span>
                    {!cloudRecommended ? <em>{copy.recommended}</em> : null}
                    <strong>{copy.updated(conflictLocal.updatedLabel)}</strong>
                    <small>{copy.taskCount(conflictLocal.taskCount)}</small>
                    <small>{copy.starCount(conflictLocal.stars)}</small>
                    <small>{copy.streakCount(conflictLocal.streak)}</small>
                  </article>
                ) : null}
              </div>
              <button
                className="gold-action full-width"
                type="button"
                onClick={cloudRecommended ? onUseCloudVersion : onUseLocalVersion}
              >
                {cloudRecommended ? (
                  <Cloud size={15} strokeWidth={1.8} />
                ) : (
                  <UploadCloud size={15} strokeWidth={1.8} />
                )}
                {copy.keepNewest}
              </button>
              <button
                className="ghost-action full-width"
                type="button"
                onClick={onUseCloudVersion}
              >
                <Cloud size={15} strokeWidth={1.8} />
                {copy.useCloud}
              </button>
              <button
                className="ghost-action full-width"
                type="button"
                onClick={onUseLocalVersion}
              >
                <UploadCloud size={15} strokeWidth={1.8} />
                {copy.useLocal}
              </button>
              <button
                className="ghost-action full-width is-safety"
                type="button"
                onClick={onExportLocalBackup}
              >
                <Download size={15} strokeWidth={1.8} />
                {copy.exportLocal}
              </button>
            </div>
          ) : user ? (
            <div className="account-actions">
              <button
                className="ghost-action full-width"
                type="button"
                onClick={onSyncNow}
                disabled={status.phase === 'syncing' || status.phase === 'checking'}
              >
                <RefreshCw size={15} strokeWidth={1.8} />
                {copy.syncNow}
              </button>
              <button className="ghost-action full-width" type="button" onClick={onSignOut}>
                <LogOut size={15} strokeWidth={1.8} />
                {copy.signOut}
              </button>
            </div>
          ) : (
            <button
              className="account-google-button"
              type="button"
              onClick={onSignIn}
              disabled={status.phase === 'checking' || status.phase === 'unconfigured'}
            >
              {status.phase === 'unconfigured' ? (
                <CloudOff size={16} strokeWidth={1.9} />
              ) : (
                <Cloud size={16} strokeWidth={1.9} />
              )}
              {status.phase === 'unconfigured'
                ? copy.setupRequired
                : copy.signInGoogle}
            </button>
          )}

          {status.lastSyncedAt ? (
            <small className="account-last-sync">
              {copy.lastSync(new Date(status.lastSyncedAt).toLocaleString())}
            </small>
          ) : null}
          {status.message ? <small className="account-error">{status.message}</small> : null}
        </div>
      ) : null}
    </div>
  )
}
