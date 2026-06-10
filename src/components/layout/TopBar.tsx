import { LockKeyhole, Settings, Sparkles, Star } from 'lucide-react'
import type { StreakState } from '../../types/app'
import { QuranMiniPlayer } from './QuranMiniPlayer'
import { StreakFlame } from './StreakFlame'

type TopBarProps = {
  currentBackground: string
  streak: StreakState
  bestPomodoroRun: number
  totalStars: number
  starBurstKey: number
  onOpenSettings: () => void
}

export function TopBar({
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
        aria-label="Open settings"
        onClick={onOpenSettings}
      >
        <Settings size={18} strokeWidth={1.8} />
      </button>
      <div className="topbar-media">
        <QuranMiniPlayer />
        <div className="topbar-actions">
          <StreakFlame streak={streak} />
          <div
            className={`best-run-star${bestPomodoroRun > 0 ? ' is-lit' : ''}`}
            aria-label="Best continuous pomodoro streak"
          >
            <span className="best-star-orb" aria-hidden="true">
              <Star size={19} strokeWidth={1.9} />
            </span>
            <div className="best-run-copy">
              <strong>{bestPomodoroRun}</strong>
              <span>best continuous</span>
            </div>
          </div>
          <div
            className={`total-stars-counter${totalStars > 0 ? ' is-lit' : ''}`}
            aria-label="Total pomodoro stars"
          >
            <span className="total-star-orb" aria-hidden="true">
              <Sparkles size={18} strokeWidth={1.9} />
            </span>
            <div className="total-stars-copy">
              <strong>{totalStars}</strong>
              <span>total stars</span>
            </div>
          </div>
          <span className="background-chip">{currentBackground}</span>
          <span className="privacy-chip">
            <LockKeyhole size={14} strokeWidth={1.8} />
            Local
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
