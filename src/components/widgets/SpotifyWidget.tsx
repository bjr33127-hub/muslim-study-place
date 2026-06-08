import { usePersistentState } from '../../hooks/usePersistentState'
import { SPOTIFY_DEFAULT_EMBED_URL } from '../../lib/defaults'

export function SpotifyWidget() {
  const [embedUrl] = usePersistentState(
    'spotify:embedUrl',
    SPOTIFY_DEFAULT_EMBED_URL,
  )

  return (
    <div className="spotify-widget">
      <iframe
        title="Spotify Quran playlist"
        className="spotify-embed"
        src={embedUrl}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    </div>
  )
}
