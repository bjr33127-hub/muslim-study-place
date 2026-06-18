import { Settings } from 'lucide-react'
import type { AppCopy } from '../../lib/i18n'
import type {
  AuthUserProfile,
  CloudConflictState,
  CloudSyncStatus,
  PomodoroRunState,
  StreakState,
  StreakUnlockCue,
} from '../../types/app'
import { AccountMenu } from './AccountMenu'
import { BestRunBadge, TotalStarsBadge } from './PomodoroMetricBadges'
import { QuranMiniPlayer } from './QuranMiniPlayer'
import { StreakFlame } from './StreakFlame'

type TopBarProps = {
  copy: AppCopy
  streak: StreakState
  streakIgniteKey: number
  streakUnlockCue: StreakUnlockCue | null
  run: PomodoroRunState
  starBurstKey: number
  bestRunBurstKey: number
  cloudUser: AuthUserProfile | null
  cloudStatus: CloudSyncStatus
  cloudConflict: CloudConflictState | null
  onOpenSettings: () => void
  onCloudSignIn: () => void
  onCloudSignOut: () => void
  onCloudSyncNow: () => void
  onUseCloudVersion: () => void
  onUseLocalVersion: () => void
  onExportLocalBackup: () => void
}

export function TopBar({
  copy,
  streak,
  streakIgniteKey,
  streakUnlockCue,
  run,
  starBurstKey,
  bestRunBurstKey,
  cloudUser,
  cloudStatus,
  cloudConflict,
  onOpenSettings,
  onCloudSignIn,
  onCloudSignOut,
  onCloudSyncNow,
  onUseCloudVersion,
  onUseLocalVersion,
  onExportLocalBackup,
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-button settings-trigger"
          type="button"
          aria-label={copy.topbar.openSettings}
          onClick={onOpenSettings}
        >
          <Settings size={18} strokeWidth={1.8} />
        </button>
        <AccountMenu
          copy={copy.account}
          user={cloudUser}
          status={cloudStatus}
          conflict={cloudConflict}
          onSignIn={onCloudSignIn}
          onSignOut={onCloudSignOut}
          onSyncNow={onCloudSyncNow}
          onUseCloudVersion={onUseCloudVersion}
          onUseLocalVersion={onUseLocalVersion}
          onExportLocalBackup={onExportLocalBackup}
        />
      </div>
      <div className="topbar-media">
        <QuranMiniPlayer copy={copy.quran} />
        <div className="topbar-actions">
          <StreakFlame
            streak={streak}
            copy={copy.streak}
            igniteKey={streakIgniteKey}
            unlockCue={streakUnlockCue}
          />
          <BestRunBadge
            run={run}
            copy={copy.topbar}
            burstKey={bestRunBurstKey}
          />
          <TotalStarsBadge
            run={run}
            copy={copy.topbar}
            showerKey={starBurstKey}
          />
        </div>
      </div>
    </header>
  )
}
