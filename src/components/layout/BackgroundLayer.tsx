import type { BackgroundAsset } from '../../types/app'
import { publicPath } from '../../lib/publicPath'
import { MagicParticles } from './MagicParticles'

type BackgroundLayerProps = {
  background?: BackgroundAsset
  dim?: number
  particlesEnabled?: boolean
}

export function BackgroundLayer({
  background,
  dim = 72,
  particlesEnabled = true,
}: BackgroundLayerProps) {
  const showParticles = Boolean(particlesEnabled && background?.kind === 'image')

  return (
    <div className="background-layer" aria-hidden="true">
      {background?.kind === 'image' ? (
        <img
          key={background.id}
          src={background.src}
          className="background-media is-image"
          alt=""
        />
      ) : (
        <video
          key={background?.id ?? 'train'}
          className="background-media"
          autoPlay
          muted
          loop
          playsInline
          poster={background?.poster}
        >
          <source
            src={background?.src ?? publicPath('backgrounds/train.f244a946.mp4')}
            type="video/mp4"
          />
        </video>
      )}
      <MagicParticles
        active={showParticles}
        sceneKey={background?.id ?? 'background'}
      />
      <div className="background-shade" style={{ opacity: dim / 100 }} />
    </div>
  )
}
