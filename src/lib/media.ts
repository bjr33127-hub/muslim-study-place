import { YOUTUBE_DEFAULT_PLAYLIST_ID } from './defaults'

const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/

export type YoutubeTarget =
  | { type: 'playlist'; playlistId: string; startVideoId?: string }
  | { type: 'video'; videoId: string }

export function normalizeYoutubeEmbed(input: string) {
  const target = parseYoutubeTarget(input)

  return target.type === 'playlist'
    ? playlistEmbed(target.playlistId)
    : videoEmbed(target.videoId)
}

export function parseYoutubeTarget(input: string): YoutubeTarget {
  const trimmed = input.trim()

  if (!trimmed) {
    return defaultYoutubeTarget()
  }

  if (YOUTUBE_ID_PATTERN.test(trimmed)) {
    return { type: 'video', videoId: trimmed }
  }

  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\./, '')
    const listId = cleanPlaylistId(url.searchParams.get('list'))
    const queryVideoId = cleanVideoId(url.searchParams.get('v'))
    const pathVideoId =
      host === 'youtu.be'
        ? cleanVideoId(url.pathname.split('/').filter(Boolean)[0])
        : cleanVideoId(
            url.pathname.startsWith('/embed/')
              ? url.pathname.split('/').filter(Boolean)[1]
              : '',
          )

    if (listId) {
      return {
        type: 'playlist',
        playlistId: listId,
        startVideoId: queryVideoId ?? pathVideoId ?? undefined,
      }
    }

    if (host === 'youtu.be') {
      return pathVideoId
        ? { type: 'video', videoId: pathVideoId }
        : defaultYoutubeTarget()
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (queryVideoId) {
        return { type: 'video', videoId: queryVideoId }
      }

      if (pathVideoId) {
        return { type: 'video', videoId: pathVideoId }
      }
    }
  } catch {
    return defaultYoutubeTarget()
  }

  return defaultYoutubeTarget()
}

function defaultYoutubeTarget(): YoutubeTarget {
  return { type: 'playlist', playlistId: YOUTUBE_DEFAULT_PLAYLIST_ID }
}

function videoEmbed(videoId: string) {
  const params = new URLSearchParams({ rel: '0' })

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}

function cleanPlaylistId(listId?: string | null) {
  const trimmed = listId?.trim()
  return trimmed || null
}

function cleanVideoId(videoId?: string | null) {
  const trimmed = videoId?.trim()
  return trimmed && YOUTUBE_ID_PATTERN.test(trimmed) ? trimmed : null
}

function playlistEmbed(listId: string) {
  const params = new URLSearchParams({
    list: listId,
    rel: '0',
  })

  return `https://www.youtube.com/embed/videoseries?${params.toString()}`
}
