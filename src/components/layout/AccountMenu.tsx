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
  const shellRef = useRef<HTMLDivElement | null>(null)
  const label = statusLabel(copy, status)

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
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" />
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
              <button className="ghost-action full-width" type="button" onClick={onUseCloudVersion}>
                <Cloud size={15} strokeWidth={1.8} />
                {copy.useCloud}
              </button>
              <button className="ghost-action full-width" type="button" onClick={onUseLocalVersion}>
                <UploadCloud size={15} strokeWidth={1.8} />
                {copy.useLocal}
              </button>
              <button className="ghost-action full-width" type="button" onClick={onExportLocalBackup}>
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
