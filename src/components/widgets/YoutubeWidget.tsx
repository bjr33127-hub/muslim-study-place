import { Save } from 'lucide-react'
import { useEffect } from 'react'
import type { FormEvent } from 'react'
import { usePersistentState } from '../../hooks/usePersistentState'
import { YOUTUBE_DEFAULT_URL } from '../../lib/defaults'
import { normalizeYoutubeEmbed } from '../../lib/media'

const legacyYoutubeUrl = 'https://www.youtube.com/watch?v=z23pnK_-0og'

export function YoutubeWidget() {
  const [youtubeUrl, setYoutubeUrl] = usePersistentState(
    'youtube:url',
    YOUTUBE_DEFAULT_URL,
  )
  const effectiveYoutubeUrl =
    youtubeUrl === legacyYoutubeUrl ? YOUTUBE_DEFAULT_URL : youtubeUrl
  const embedUrl = normalizeYoutubeEmbed(effectiveYoutubeUrl)

  useEffect(() => {
    if (youtubeUrl === legacyYoutubeUrl) {
      setYoutubeUrl(YOUTUBE_DEFAULT_URL)
    }
  }, [setYoutubeUrl, youtubeUrl])

  const saveUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const nextUrl = String(data.get('youtube-url') ?? '').trim()

    setYoutubeUrl(nextUrl || YOUTUBE_DEFAULT_URL)
  }

  return (
    <div className="media-widget">
      <div className="youtube-shell">
        <iframe
          title="YouTube Quran player"
          className="youtube-embed"
          src={embedUrl}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <form className="url-form" onSubmit={saveUrl}>
        <input
          key={effectiveYoutubeUrl}
          name="youtube-url"
          defaultValue={effectiveYoutubeUrl}
          aria-label="YouTube URL"
        />
        <button type="submit" aria-label="Save YouTube URL">
          <Save size={15} strokeWidth={1.9} />
        </button>
      </form>
    </div>
  )
}
