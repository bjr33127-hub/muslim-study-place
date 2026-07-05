import { Settings } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { AppCopy } from '../../lib/i18n'
import type {
  AuthUserProfile,
  CloudConflictState,
  CloudSyncStatus,
  FlameEvolutionState,
  FlameEvolutionUnlockCue,
  FlameQuestEffect,
  PomodoroRunState,
  StreakState,
  StreakUnlockCue,
} from '../../types/app'
import { AccountMenu } from './AccountMenu'
import { BestRunBadge, TotalStarsBadge } from './PomodoroMetricBadges'
import { QuranMiniPlayer } from './QuranMiniPlayer'
import { StreakFlame } from './StreakFlame'

type OpenMetricPanel = 'streak' | 'bestRun' | 'totalStars' | null

type TopBarProps = {
  copy: AppCopy
  streak: StreakState
  streakIgniteKey: number
  streakUnlockCue: StreakUnlockCue | null
  flameEvolution: FlameEvolutionState
  flameEvolutionCue: FlameEvolutionUnlockCue | null
  onFlameEffectChange: (effect: FlameQuestEffect | null) => void
  onClaimFlameEvolution: (cue: FlameEvolutionUnlockCue) => void
  run: PomodoroRunState
  starBurstKey: number
  bestRunBurstKey: number
  cloudUser: AuthUserProfile | null
  cloudStatus: CloudSyncStatus
  cloudConflict: CloudConflictState | null
  miniPomodoro?: ReactNode
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
  flameEvolution,
  flameEvolutionCue,
  onFlameEffectChange,
  onClaimFlameEvolution,
  run,
  starBurstKey,
  bestRunBurstKey,
  cloudUser,
  cloudStatus,
  cloudConflict,
  miniPomodoro,
  onOpenSettings,
  onCloudSignIn,
  onCloudSignOut,
  onCloudSyncNow,
  onUseCloudVersion,
  onUseLocalVersion,
  onExportLocalBackup,
}: TopBarProps) {
  const [openMetricPanel, setOpenMetricPanel] = useState<OpenMetricPanel>(null)
  const toggleMetricPanel = (panel: Exclude<OpenMetricPanel, null>) => {
    setOpenMetricPanel((current) => (current === panel ? null : panel))
  }

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
        <div className="topbar-player-cluster">
          {miniPomodoro}
          <QuranMiniPlayer copy={copy.quran} />
        </div>
        <div className="topbar-actions">
          <StreakFlame
            streak={streak}
            copy={copy.streak}
            igniteKey={streakIgniteKey}
            unlockCue={streakUnlockCue}
            evolution={flameEvolution}
            evolutionCue={flameEvolutionCue}
            isOpen={openMetricPanel === 'streak'}
            onToggleOpen={() => toggleMetricPanel('streak')}
            onClose={() => setOpenMetricPanel(null)}
            onEffectChange={onFlameEffectChange}
            onClaimEvolution={onClaimFlameEvolution}
          />
          <BestRunBadge
            run={run}
            copy={copy.topbar}
            burstKey={bestRunBurstKey}
            isOpen={openMetricPanel === 'bestRun'}
            onToggleOpen={() => toggleMetricPanel('bestRun')}
            onClose={() => setOpenMetricPanel(null)}
          />
          <TotalStarsBadge
            run={run}
            copy={copy.topbar}
            showerKey={starBurstKey}
            isOpen={openMetricPanel === 'totalStars'}
            onToggleOpen={() => toggleMetricPanel('totalStars')}
            onClose={() => setOpenMetricPanel(null)}
          />
        </div>
      </div>
    </header>
  )
}
