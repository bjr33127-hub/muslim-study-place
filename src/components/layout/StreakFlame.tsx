import { Flame } from 'lucide-react'
import type { StreakState } from '../../types/app'

type StreakFlameProps = {
  streak: StreakState
  label: string
}

export function StreakFlame({ streak, label }: StreakFlameProps) {
  const isLit = streak.current > 0

  return (
    <div className={`streak-flame${isLit ? ' is-lit' : ''}`}>
      <div className="flame-orb" aria-hidden="true">
        <Flame size={21} strokeWidth={2} />
      </div>
      <div className="streak-copy">
        <strong>{streak.current}</strong>
        <span>{label}</span>
      </div>
      <small>{streak.todayCount}/{streak.dailyGoal}</small>
    </div>
  )
}
