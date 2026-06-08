import { SPOTIFY_DEFAULT_EMBED_URL, YOUTUBE_DEFAULT_VIDEO_ID } from './defaults'

const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/

export function normalizeSpotifyEmbed(input: string) {
  const trimmed = input.trim()

  if (!trimmed) {
    return SPOTIFY_DEFAULT_EMBED_URL
  }

  try {
    const url = new URL(trimmed)

    if (!url.hostname.includes('spotify.com')) {
      return SPOTIFY_DEFAULT_EMBED_URL
    }

    const parts = url.pathname.split('/').filter(Boolean)
    const embedParts = parts[0] === 'embed' ? parts.slice(1) : parts
    const [kind, id] = embedParts

    if (!kind || !id) {
      return SPOTIFY_DEFAULT_EMBED_URL
    }

    return `https://open.spotify.com/embed/${kind}/${id}`
  } catch {
    return SPOTIFY_DEFAULT_EMBED_URL
  }
}

export function normalizeYoutubeEmbed(input: string) {
  const trimmed = input.trim()

  if (!trimmed) {
    return `https://www.youtube.com/embed/${YOUTUBE_DEFAULT_VIDEO_ID}`
  }

  if (YOUTUBE_ID_PATTERN.test(trimmed)) {
    return `https://www.youtube.com/embed/${trimmed}`
  }

  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\./, '')
    const listId = url.searchParams.get('list')

    if (host === 'youtu.be') {
      const videoId = url.pathname.split('/').filter(Boolean)[0]
      return videoId && YOUTUBE_ID_PATTERN.test(videoId)
        ? `https://www.youtube.com/embed/${videoId}`
        : `https://www.youtube.com/embed/${YOUTUBE_DEFAULT_VIDEO_ID}`
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const videoId = url.searchParams.get('v')
      const embedId = url.pathname.startsWith('/embed/')
        ? url.pathname.split('/').filter(Boolean)[1]
        : ''

      if (videoId && YOUTUBE_ID_PATTERN.test(videoId)) {
        return `https://www.youtube.com/embed/${videoId}`
      }

      if (embedId && YOUTUBE_ID_PATTERN.test(embedId)) {
        return `https://www.youtube.com/embed/${embedId}`
      }

      if (listId) {
        return `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(
          listId,
        )}`
      }
    }
  } catch {
    return `https://www.youtube.com/embed/${YOUTUBE_DEFAULT_VIDEO_ID}`
  }

  return `https://www.youtube.com/embed/${YOUTUBE_DEFAULT_VIDEO_ID}`
}
