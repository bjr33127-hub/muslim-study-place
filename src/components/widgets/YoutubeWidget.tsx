import { ExternalLink, Save } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { usePersistentState } from '../../hooks/usePersistentState'
import { YOUTUBE_DEFAULT_URL } from '../../lib/defaults'
import { parseYoutubeTarget } from '../../lib/media'
import type { YoutubeTarget } from '../../lib/media'

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      width?: string | number
      height?: string | number
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (event: YouTubePlayerEvent) => void
        onError?: (event: YouTubePlayerErrorEvent) => void
        onStateChange?: (event: YouTubePlayerStateEvent) => void
      }
    },
  ) => YouTubePlayer
}

type YouTubePlayer = {
  destroy: () => void
  getIframe: () => HTMLIFrameElement
  getPlayerState: () => number
  getPlaylist?: () => string[]
  getPlaylistIndex?: () => number
  nextVideo: () => void
  pauseVideo: () => void
  playVideo: () => void
}

type YouTubePlayerEvent = {
  target: YouTubePlayer
}

type YouTubePlayerErrorEvent = YouTubePlayerEvent & {
  data: number
}

type YouTubePlayerStateEvent = YouTubePlayerEvent & {
  data: number
}

type YouTubePlayerStatus = {
  embedUrl: string
  error: string
  notice: string
  ready: boolean
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

const legacyYoutubeUrl = 'https://www.youtube.com/watch?v=z23pnK_-0og'
const YOUTUBE_API_SCRIPT = 'https://www.youtube.com/iframe_api'
const PLAYER_STATE = {
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5,
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null

function loadYouTubeApi() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise
  }

  const promise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady
    const timeout = window.setTimeout(() => {
      reject(new Error('YouTube API timed out.'))
    }, 10000)

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      window.clearTimeout(timeout)

      if (window.YT?.Player) {
        resolve(window.YT)
      } else {
        reject(new Error('YouTube API did not expose a player.'))
      }
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${YOUTUBE_API_SCRIPT}"]`,
    )

    if (existingScript) {
      return
    }

    const script = document.createElement('script')
    script.src = YOUTUBE_API_SCRIPT
    script.async = true
    script.onerror = () => reject(new Error('YouTube API could not load.'))
    document.head.appendChild(script)
  })

  youtubeApiPromise = promise.catch((error) => {
    youtubeApiPromise = null
    throw error
  })

  return youtubeApiPromise
}

function apiEmbedUrl(target: YoutubeTarget) {
  const params = new URLSearchParams({
    enablejsapi: '1',
    origin: window.location.origin,
    rel: '0',
  })

  if (target.type === 'playlist') {
    params.set('list', target.playlistId)
    return `https://www.youtube.com/embed/videoseries?${params.toString()}`
  }

  return `https://www.youtube.com/embed/${target.videoId}?${params.toString()}`
}

function targetHref(target: YoutubeTarget) {
  if (target.type === 'playlist') {
    return `https://www.youtube.com/playlist?list=${target.playlistId}`
  }

  return `https://www.youtube.com/watch?v=${target.videoId}`
}

function targetLabel(target: YoutubeTarget) {
  return target.type === 'playlist' ? 'Playlist' : 'Video'
}

function errorCopy(code: number) {
  if (code === 101 || code === 150) {
    return 'Video embed blocked. Skipping to the next available video.'
  }

  if (code === 100) {
    return 'Video unavailable. Skipping to the next available video.'
  }

  return 'YouTube could not play this item. Trying the next one.'
}

export function YoutubeWidget() {
  const [youtubeUrl, setYoutubeUrl] = usePersistentState(
    'youtube:url',
    YOUTUBE_DEFAULT_URL,
  )
  const effectiveYoutubeUrl =
    youtubeUrl === legacyYoutubeUrl ? YOUTUBE_DEFAULT_URL : youtubeUrl
  const target = useMemo(
    () => parseYoutubeTarget(effectiveYoutubeUrl),
    [effectiveYoutubeUrl],
  )
  const embedUrl = useMemo(() => apiEmbedUrl(target), [target])
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const targetRef = useRef(target)
  const skipTimerRef = useRef<number | null>(null)
  const skipAttemptsRef = useRef(0)
  const playbackIntentRef = useRef(false)
  const [playerStatus, setPlayerStatus] = useState<YouTubePlayerStatus>({
    embedUrl: '',
    error: '',
    notice: 'Loading YouTube player...',
    ready: false,
  })
  const playerReady = playerStatus.embedUrl === embedUrl && playerStatus.ready
  const notice =
    playerStatus.embedUrl === embedUrl
      ? playerStatus.notice
      : 'Loading YouTube player...'
  const playerError = playerStatus.embedUrl === embedUrl ? playerStatus.error : ''

  useEffect(() => {
    targetRef.current = target
  }, [target])

  useEffect(() => {
    if (youtubeUrl === legacyYoutubeUrl) {
      setYoutubeUrl(YOUTUBE_DEFAULT_URL)
    }
  }, [setYoutubeUrl, youtubeUrl])

  useEffect(() => {
    let cancelled = false
    const currentEmbedUrl = embedUrl

    loadYouTubeApi()
      .then((yt) => {
        if (cancelled || !iframeRef.current) {
          return
        }

        playerRef.current = new yt.Player(iframeRef.current, {
          events: {
            onReady: (event) => {
              const iframe = event.target.getIframe()
              iframe.setAttribute('title', 'YouTube Quran player')
              iframe.classList.add('youtube-embed')
              setPlayerStatus({
                embedUrl: currentEmbedUrl,
                error: '',
                notice: 'Ready',
                ready: true,
              })
            },
            onError: (event) => {
              const currentTarget = targetRef.current
              const player = event.target

              if (currentTarget.type !== 'playlist') {
                setPlayerStatus({
                  embedUrl: currentEmbedUrl,
                  error: 'This video is unavailable. Paste another YouTube video or playlist.',
                  notice: 'Unavailable',
                  ready: true,
                })
                return
              }

              const playlistLength = player.getPlaylist?.().length ?? 0
              const maxAttempts = Math.max(playlistLength, 10)

              if (skipAttemptsRef.current >= maxAttempts) {
                setPlayerStatus({
                  embedUrl: currentEmbedUrl,
                  error: 'This playlist has too many unavailable videos.',
                  notice: 'Unavailable',
                  ready: true,
                })
                return
              }

              skipAttemptsRef.current += 1
              setPlayerStatus((current) =>
                current.embedUrl === currentEmbedUrl
                  ? {
                      ...current,
                      error: '',
                      notice: errorCopy(event.data),
                    }
                  : current,
              )

              if (skipTimerRef.current) {
                window.clearTimeout(skipTimerRef.current)
              }

              skipTimerRef.current = window.setTimeout(() => {
                const shouldKeepPlaying = playbackIntentRef.current

                player.nextVideo()

                if (shouldKeepPlaying) {
                  window.setTimeout(() => player.playVideo(), 450)
                } else {
                  window.setTimeout(() => player.pauseVideo(), 450)
                }
              }, 350)
            },
            onStateChange: (event) => {
              if (
                event.data === PLAYER_STATE.playing ||
                event.data === PLAYER_STATE.buffering ||
                event.data === PLAYER_STATE.ended
              ) {
                playbackIntentRef.current = true
              }

              if (
                event.data === PLAYER_STATE.paused ||
                event.data === PLAYER_STATE.cued
              ) {
                playbackIntentRef.current = false
              }

              if (event.data === PLAYER_STATE.playing) {
                skipAttemptsRef.current = 0
                setPlayerStatus((current) =>
                  current.embedUrl === currentEmbedUrl
                    ? {
                        ...current,
                        error: '',
                        notice: 'Playing',
                      }
                    : current,
                )
              }

              if (event.data === PLAYER_STATE.paused) {
                setPlayerStatus((current) =>
                  current.embedUrl === currentEmbedUrl
                    ? {
                        ...current,
                        notice: 'Paused',
                      }
                    : current,
                )
              }

              if (event.data === PLAYER_STATE.cued) {
                setPlayerStatus((current) =>
                  current.embedUrl === currentEmbedUrl
                    ? {
                        ...current,
                        notice: 'Ready',
                      }
                    : current,
                )
              }
            },
          },
        })
      })
      .catch(() => {
        if (!cancelled) {
          setPlayerStatus({
            embedUrl: currentEmbedUrl,
            error: 'YouTube could not load here. Open the playlist on YouTube.',
            notice: 'Unavailable',
            ready: false,
          })
        }
      })

    return () => {
      cancelled = true

      if (skipTimerRef.current) {
        window.clearTimeout(skipTimerRef.current)
      }

      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [embedUrl])

  const saveUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const nextUrl = String(data.get('youtube-url') ?? '').trim()

    setYoutubeUrl(nextUrl || YOUTUBE_DEFAULT_URL)
  }

  return (
    <div
      className="media-widget youtube-widget"
      data-player-ready={playerReady ? 'true' : 'false'}
      data-youtube-kind={target.type}
      data-youtube-playlist-id={target.type === 'playlist' ? target.playlistId : ''}
      data-youtube-video-id={target.type === 'video' ? target.videoId : ''}
    >
      <div className="youtube-shell">
        <iframe
          key={embedUrl}
          ref={iframeRef}
          title="YouTube Quran player"
          className="youtube-embed"
          src={embedUrl}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <div className="youtube-meta-row">
        <span>{targetLabel(target)}</span>
        <strong>{notice}</strong>
        <a href={targetHref(target)} target="_blank" rel="noreferrer">
          <ExternalLink size={13} strokeWidth={1.9} />
          YouTube
        </a>
      </div>
      {playerError ? <p className="youtube-error">{playerError}</p> : null}
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
