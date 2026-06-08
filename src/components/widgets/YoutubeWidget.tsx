import { Play, Save } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { usePersistentState } from '../../hooks/usePersistentState'
import { YOUTUBE_DEFAULT_VIDEO_ID } from '../../lib/defaults'
import { normalizeYoutubeEmbed } from '../../lib/media'

const defaultYoutubeUrl = `https://www.youtube.com/watch?v=${YOUTUBE_DEFAULT_VIDEO_ID}`

export function YoutubeWidget() {
  const [youtubeUrl, setYoutubeUrl] = usePersistentState(
    'youtube:url',
    defaultYoutubeUrl,
  )
  const [draft, setDraft] = useState(youtubeUrl)
  const [isRevealed, setIsRevealed] = useState(false)
  const embedUrl = normalizeYoutubeEmbed(youtubeUrl)

  const saveUrl = (event: FormEvent) => {
    event.preventDefault()
    setYoutubeUrl(draft.trim() || defaultYoutubeUrl)
    setIsRevealed(false)
  }

  return (
    <div className="media-widget">
      <div className="youtube-shell">
        <iframe
          title="YouTube Quran player"
          className={`youtube-embed${isRevealed ? '' : ' is-concealed'}`}
          src={embedUrl}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
        {!isRevealed ? (
          <button
            className="youtube-overlay"
            type="button"
            onClick={() => setIsRevealed(true)}
          >
            <Play size={28} strokeWidth={1.8} />
            <span>Omar Bn DiaaAldeen</span>
            <strong>Load YouTube</strong>
          </button>
        ) : null}
      </div>
      <form className="url-form" onSubmit={saveUrl}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="YouTube URL"
        />
        <button type="submit" aria-label="Save YouTube URL">
          <Save size={15} strokeWidth={1.9} />
        </button>
      </form>
    </div>
  )
}
