import { FlaskConical, Sparkles, X } from 'lucide-react'
import type { AppCopy } from '../../lib/i18n'
import {
  FLAME_QUEST_EFFECTS,
  FLAME_QUEST_IDS,
  SECRET_FLAME_STAGES,
} from '../../lib/flameEvolution'
import type {
  BaseFlameStage,
  FlamePreviewRequest,
} from '../../types/app'
import { FlameMark } from './FlameVisual'

type FlameWorkshopProps = {
  copy: AppCopy['streak']
  onClose: () => void
  onPreview: (request: FlamePreviewRequest) => void
}

const BASE_STAGES: readonly BaseFlameStage[] = [
  'ember',
  'verdant',
  'azure',
  'ultimate',
]

export function FlameWorkshop({
  copy,
  onClose,
  onPreview,
}: FlameWorkshopProps) {
  return (
    <div
      className="flame-workshop"
      role="dialog"
      aria-modal="true"
      aria-label={copy.workshopTitle}
    >
      <div className="flame-workshop-panel">
        <header className="flame-workshop-header">
          <span aria-hidden="true">
            <FlaskConical size={24} strokeWidth={1.6} />
          </span>
          <div>
            <small>{copy.workshopTemporary}</small>
            <h2>{copy.workshopTitle}</h2>
            <p>{copy.workshopSubtitle}</p>
          </div>
          <button
            className="quiet-icon"
            type="button"
            aria-label={copy.workshopClose}
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>

        <section className="workshop-section">
          <h3>{copy.workshopBaseForms}</h3>
          <div className="workshop-flame-grid">
            {BASE_STAGES.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() =>
                  onPreview({
                    kind: 'flame',
                    stage,
                    label: copy.baseStageNames[stage],
                  })}
              >
                <FlameMark effect={null} stage={stage} />
                <span>{copy.baseStageNames[stage]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="workshop-section">
          <h3>{copy.workshopAscensions}</h3>
          <div className="workshop-flame-grid">
            {SECRET_FLAME_STAGES.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => onPreview({ kind: 'ascension', stage })}
              >
                <FlameMark effect={null} stage={stage} />
                <span>{copy.stageNames[stage]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="workshop-section">
          <h3>{copy.workshopEffects}</h3>
          <div className="workshop-effect-grid">
            {FLAME_QUEST_IDS.map((quest) => (
              <button
                key={quest}
                type="button"
                onClick={() => onPreview({ kind: 'quest', quest })}
              >
                <span className={`workshop-effect-mark effect-${FLAME_QUEST_EFFECTS[quest]}`}>
                  <FlameMark
                    effect={FLAME_QUEST_EFFECTS[quest]}
                    stage="ultimate"
                  />
                </span>
                <span>{copy.questNames[quest]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="workshop-section workshop-scenes">
          <h3>{copy.workshopScenes}</h3>
          <div>
            <button
              type="button"
              onClick={() => onPreview({ kind: 'ascension', stage: 'apogee' })}
            >
              <Sparkles size={16} />
              {copy.workshopAscensionReveal}
            </button>
            <button
              type="button"
              onClick={() => onPreview({ kind: 'quest', quest: 'hundred-stars' })}
            >
              <Sparkles size={16} />
              {copy.workshopQuestReveal}
            </button>
            <button type="button" onClick={() => onPreview({ kind: 'group' })}>
              <Sparkles size={16} />
              {copy.workshopGroupReveal}
            </button>
            <button type="button" onClick={() => onPreview({ kind: 'day-unlock' })}>
              <Sparkles size={16} />
              {copy.workshopDayUnlock}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
