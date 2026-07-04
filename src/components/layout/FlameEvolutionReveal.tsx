import { Gift } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { AppCopy } from '../../lib/i18n'
import type {
  FlameEvolutionUnlockCue,
  FlameQuestEffect,
  FlameStage,
} from '../../types/app'
import { FlameMark } from './FlameVisual'

type FlameEvolutionRevealProps = {
  copy: AppCopy['streak']
  cue: FlameEvolutionUnlockCue
  stage: FlameStage
  effect: FlameQuestEffect | null
  onClaim: () => void
}

export function FlameEvolutionReveal({
  copy,
  cue,
  stage,
  effect,
  onClaim,
}: FlameEvolutionRevealProps) {
  const revealCount = cue.stages.length + cue.quests.length
  const revealTitle = cue.preview
    ? cue.previewKind === 'quest'
      ? copy.questUnlocked
      : cue.previewKind === 'group'
        ? copy.secretsUnlocked(revealCount)
        : cue.previewKind === 'flame'
          ? copy.workshopBaseForms
          : copy.ascensionUnlocked
    : cue.stages.length
      ? copy.ascensionUnlocked
      : cue.quests.length === 1
        ? copy.questUnlocked
        : copy.secretsUnlocked(revealCount)
  const revealNames = cue.previewLabel
    ? [cue.previewLabel]
    : [
        ...cue.stages.map((item) => copy.stageNames[item]),
        ...cue.quests.map((item) => copy.questNames[item]),
      ]

  const reveal = (
    <div
      className={[
        'flame-evolution-reveal',
        cue.stages.length || cue.previewKind === 'ascension'
          ? 'is-ascension'
          : 'is-quest',
        cue.preview ? 'is-preview' : '',
        `stage-${stage}`,
      ].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={revealTitle}
    >
      <span className="flame-reveal-wave" />
      <span className="flame-reveal-mark">
        <FlameMark effect={effect} large stage={stage} />
      </span>
      <span className="flame-reveal-copy">
        {cue.preview ? <em>{copy.previewLabel}</em> : null}
        <small>{revealTitle}</small>
        <span
          className={`flame-reveal-names${revealNames.length > 1 ? ' is-many' : ''}`}
        >
          {revealNames.map((name) => <strong key={name}>{name}</strong>)}
        </span>
      </span>
      <button
        className="flame-claim-button"
        type="button"
        onClick={onClaim}
        autoFocus
      >
        <Gift size={18} strokeWidth={2} />
        {copy.claimReward}
      </button>
      <span className="flame-reveal-particles" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
      </span>
    </div>
  )

  return createPortal(reveal, document.body)
}
