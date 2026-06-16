import { LockKeyhole, Settings, Sparkles, Star } from 'lucide-react'
import type { AppCopy } from '../../lib/i18n'
import type { StreakState } from '../../types/app'
import { QuranMiniPlayer } from './QuranMiniPlayer'
import { StreakFlame } from './StreakFlame'

type TopBarProps = {
  copy: AppCopy
  currentBackground: string
  streak: StreakState
  bestPomodoroRun: number
  totalStars: number
  starBurstKey: number
  onOpenSettings: () => void
}

export function TopBar({
  copy,
  currentBackground,
  streak,
  bestPomodoroRun,
  totalStars,
  starBurstKey,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className="topbar">
      <button
        className="icon-button settings-trigger"
        type="button"
        aria-label={copy.topbar.openSettings}
        onClick={onOpenSettings}
      >
        <Settings size={18} strokeWidth={1.8} />
      </button>
      <div className="topbar-media">
        <QuranMiniPlayer copy={copy.quran} />
        <div className="topbar-actions">
          <StreakFlame streak={streak} label={copy.streak.label} />
          <div
            className={`best-run-star${bestPomodoroRun > 0 ? ' is-lit' : ''}`}
            aria-label={copy.topbar.bestRunAria}
          >
            <span className="best-star-orb" aria-hidden="true">
              <Star size={19} strokeWidth={1.9} />
            </span>
            <div className="best-run-copy">
              <strong>{bestPomodoroRun}</strong>
              <span>{copy.topbar.bestRun}</span>
            </div>
          </div>
          <div
            className={`total-stars-counter${totalStars > 0 ? ' is-lit' : ''}`}
            aria-label={copy.topbar.totalStarsAria}
          >
            <span className="total-star-orb" aria-hidden="true">
              <Sparkles size={18} strokeWidth={1.9} />
            </span>
            <div className="total-stars-copy">
              <strong>{totalStars}</strong>
              <span>{copy.topbar.totalStars}</span>
            </div>
          </div>
          <span className="background-chip">{currentBackground}</span>
          <span className="privacy-chip">
            <LockKeyhole size={14} strokeWidth={1.8} />
            {copy.app.local}
          </span>
        </div>
      </div>
      {starBurstKey ? (
        <span key={starBurstKey} className="star-flight" aria-hidden="true">
          <Star size={18} strokeWidth={1.8} />
        </span>
      ) : null}
    </header>
  )
}
