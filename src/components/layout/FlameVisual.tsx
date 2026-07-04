import type {
  FlameQuestEffect,
  FlameStage,
} from '../../types/app'

export function FlameMark({
  effect,
  large = false,
  stage,
}: {
  effect: FlameQuestEffect | null
  large?: boolean
  stage: FlameStage
}) {
  return (
    <span
      className={[
        'duo-flame',
        large ? 'is-large' : '',
        `stage-${stage}`,
        effect ? `effect-${effect}` : '',
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <span className="duo-flame-glow" />
      <span className="flame-apogee-spectrum">
        {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
      </span>
      <span className="flame-ascension-ring ring-one" />
      <span className="flame-ascension-ring ring-two" />
      <span className="flame-ascension-ring ring-three" />
      <span className="duo-flame-back" />
      <span className="duo-flame-mid" />
      <span className="duo-flame-core" />
      <span className="flame-ascension-crown" />
      <span className="flame-quest-effect">
        {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
      </span>
      <span className="flame-quest-object">
        {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
      </span>
      <span className="flame-fragments">
        <i />
        <i />
        <i />
      </span>
      <span className="duo-spark spark-one" />
      <span className="duo-spark spark-two" />
      <span className="duo-spark spark-three" />
    </span>
  )
}
