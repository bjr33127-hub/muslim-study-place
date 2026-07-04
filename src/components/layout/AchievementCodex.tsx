import { BookOpen, LockKeyhole, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import type { AppCopy } from '../../lib/i18n'
import {
  FLAME_QUEST_IDS,
  SECRET_FLAME_STAGES,
} from '../../lib/flameEvolution'
import type {
  FlameEvolutionState,
  FlameQuestId,
  FlameUnlockKey,
  SecretFlameStage,
} from '../../types/app'

type AchievementCodexProps = {
  copy: AppCopy['streak']
  evolution: FlameEvolutionState
  onClose: () => void
  onRevealHint: (key: FlameUnlockKey) => void
}

type CodexEntry =
  | { kind: 'stage'; id: SecretFlameStage; key: FlameUnlockKey }
  | { kind: 'quest'; id: FlameQuestId; key: FlameUnlockKey }

export function AchievementCodex({
  copy,
  evolution,
  onClose,
  onRevealHint,
}: AchievementCodexProps) {
  const [tab, setTab] = useState<'stages' | 'quests'>('stages')
  const stageEntries: CodexEntry[] = SECRET_FLAME_STAGES.map((id) => ({
    kind: 'stage',
    id,
    key: `stage:${id}`,
  }))
  const questEntries: CodexEntry[] = FLAME_QUEST_IDS.map((id) => ({
    kind: 'quest',
    id,
    key: `quest:${id}`,
  }))
  const entries = tab === 'stages' ? stageEntries : questEntries
  const unlockedStages = SECRET_FLAME_STAGES.filter(
    (stage) => evolution.stages[stage],
  ).length
  const unlockedQuests = FLAME_QUEST_IDS.filter(
    (quest) => evolution.quests[quest],
  ).length

  return (
    <div
      className="achievement-codex"
      role="dialog"
      aria-modal="true"
      aria-label={copy.codexTitle}
    >
      <div className="codex-manuscript">
        <header className="codex-header">
          <span className="codex-emblem" aria-hidden="true">
            <BookOpen size={26} strokeWidth={1.5} />
          </span>
          <div>
            <h2>{copy.codexTitle}</h2>
            <p>{copy.codexSubtitle}</p>
          </div>
          <button
            className="quiet-icon codex-close"
            type="button"
            aria-label={copy.codexClose}
            onClick={onClose}
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </header>

        <div className="codex-tabs" role="tablist">
          <button
            className={tab === 'stages' ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={tab === 'stages'}
            onClick={() => setTab('stages')}
          >
            {copy.codexAscensions}
            <small>{copy.codexUnlockedCount(unlockedStages, 4)}</small>
          </button>
          <button
            className={tab === 'quests' ? 'is-active' : ''}
            type="button"
            role="tab"
            aria-selected={tab === 'quests'}
            onClick={() => setTab('quests')}
          >
            {copy.codexQuests}
            <small>{copy.codexUnlockedCount(unlockedQuests, 7)}</small>
          </button>
        </div>

        <div className="codex-pages">
          {entries.map((entry, index) => {
            const unlockedAt =
              entry.kind === 'stage'
                ? evolution.stages[entry.id]
                : evolution.quests[entry.id]
            const isUnlocked = Boolean(unlockedAt)
            const hintCount = evolution.revealedHints[entry.key] ?? 0
            const name =
              entry.kind === 'stage'
                ? copy.stageNames[entry.id]
                : copy.questNames[entry.id]
            const riddle =
              entry.kind === 'stage'
                ? copy.stageRiddles[entry.id]
                : copy.questRiddles[entry.id]
            const hints =
              entry.kind === 'stage'
                ? copy.stageHints[entry.id]
                : copy.questHints[entry.id]
            const answer =
              entry.kind === 'stage'
                ? copy.stageAnswers[entry.id]
                : copy.questAnswers[entry.id]

            return (
              <article
                className={`codex-entry${isUnlocked ? ' is-unlocked' : ' is-locked'}`}
                key={entry.key}
              >
                <div className="codex-entry-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="codex-entry-body">
                  <div className="codex-entry-title">
                    <span aria-hidden="true">
                      {isUnlocked
                        ? <Sparkles size={18} strokeWidth={1.7} />
                        : <LockKeyhole size={17} strokeWidth={1.7} />}
                    </span>
                    <div>
                      <small>
                        {entry.kind === 'stage'
                          ? copy.codexAscensions
                          : copy.codexQuests}
                      </small>
                      <h3>{isUnlocked ? name : copy.codexLocked}</h3>
                    </div>
                    {unlockedAt ? (
                      <time dateTime={new Date(unlockedAt).toISOString()}>
                        {copy.unlockedOn(
                          new Date(unlockedAt).toLocaleDateString(),
                        )}
                      </time>
                    ) : null}
                  </div>

                  <div className="codex-riddle">
                    <small>{copy.codexRiddle}</small>
                    <p>{riddle}</p>
                  </div>

                  <div className="codex-hints">
                    <small>{copy.codexHints}</small>
                    {hints.map((hint, hintIndex) => {
                      const revealed = isUnlocked || hintCount > hintIndex
                      const available = isUnlocked || hintIndex === 0 || hintCount > 0

                      return revealed ? (
                        <p key={hint}>{hint}</p>
                      ) : (
                        <button
                          key={`${entry.key}:${hintIndex}`}
                          type="button"
                          disabled={!available}
                          onClick={() => onRevealHint(entry.key)}
                        >
                          <LockKeyhole size={14} strokeWidth={1.8} />
                          {available
                            ? copy.codexRevealHint(hintIndex + 1)
                            : copy.codexHintSealed}
                        </button>
                      )
                    })}
                  </div>

                  {isUnlocked ? (
                    <div className="codex-answer">
                      <small>{copy.codexAnswer}</small>
                      <strong>{answer}</strong>
                      <span>{copy.codexReward}: {name}</span>
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
