import { ExternalLink, Headphones } from 'lucide-react'
import { SPOTIFY_PLAYLIST_URL } from '../../lib/defaults'

export function SpotifyWidget() {
  return (
    <div className="spotify-widget">
      <div className="spotify-launcher">
        <span className="spotify-mark" aria-hidden="true">
          <Headphones size={26} strokeWidth={1.7} />
        </span>
        <div>
          <p>Quran playlist</p>
          <h3>Omar Bn DiaaAldeen</h3>
          <span>Open in Spotify for full playback.</span>
        </div>
        <a
          className="primary-action spotify-open-link"
          href={SPOTIFY_PLAYLIST_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open Spotify
          <ExternalLink size={16} strokeWidth={1.9} />
        </a>
      </div>
    </div>
  )
}
