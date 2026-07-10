import {
  Check,
  ChevronLeft,
  ChevronRight,
  ListVideo,
  Play,
  Save,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { usePersistentState } from '../../hooks/usePersistentState'
import { YOUTUBE_DEFAULT_URL } from '../../lib/defaults'
import type { AppCopy } from '../../lib/i18n'
import { parseYoutubeTarget } from '../../lib/media'
import type { YoutubeTarget } from '../../lib/media'
import {
  alignPlaylistDataToOfficialOrder,
  buildIframePlaylistData,
  enrichPlaylistDataWithVideoMetadata,
  fetchNextPlaylistPage,
  fetchPlaylistMetadata,
  mergePlaylistData,
  playlistNeedsVideoMetadata,
  readCachedPlaylist,
} from '../../lib/youtubePlaylist'
import type {
  YoutubePlaylistData,
  YoutubePlaylistVideo,
} from '../../lib/youtubePlaylist'

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId?: string
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
  cuePlaylist?: (options: {
    index?: number
    list: string
    listType: 'playlist'
    startSeconds?: number
  }) => void
  cueVideoById?: (videoId: string) => void
  destroy: () => void
  getIframe: () => HTMLIFrameElement
  getPlayerState: () => number
  getPlaylist?: () => string[] | null
  getPlaylistIndex?: () => number
  nextVideo: () => void
  pauseVideo: () => void
  playVideo: () => void
  playVideoAt?: (index: number) => void
  previousVideo?: () => void
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
  error: string
  notice: string
  playerKey: string
  ready: boolean
}

type PlaylistOrder = 'asc' | 'desc'
type WatchedVideosByPlaylist = Record<string, Record<string, boolean>>

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

const legacyYoutubeUrl = 'https://www.youtube.com/watch?v=z23pnK_-0og'
const YOUTUBE_API_SCRIPT = 'https://www.youtube.com/iframe_api'
const VIDEO_METADATA_REQUEST_VERSION = 'oembed-v4'
const VIDEO_METADATA_RETRY_DELAY = 12000
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

function playerKey(target: YoutubeTarget) {
  return target.type === 'playlist'
    ? `playlist:${target.playlistId}:${target.startVideoId ?? ''}`
    : `video:${target.videoId}`
}

function playerVars(target: YoutubeTarget) {
  const vars: Record<string, string | number> = {
    enablejsapi: 1,
    iv_load_policy: 3,
    modestbranding: 1,
    origin: window.location.origin,
    playsinline: 1,
    rel: 0,
  }

  if (target.type === 'playlist') {
    vars.list = target.playlistId
    vars.listType = 'playlist'
  }

  return vars
}

function iframeSrc(
  target: YoutubeTarget,
  activeIndex: number,
  autoplay: boolean,
) {
  const params = new URLSearchParams({
    enablejsapi: '1',
    iv_load_policy: '3',
    modestbranding: '1',
    origin: window.location.origin,
    playsinline: '1',
    rel: '0',
  })

  if (autoplay) {
    params.set('autoplay', '1')
  }

  if (target.type === 'video') {
    return `https://www.youtube.com/embed/${target.videoId}?${params.toString()}`
  }

  params.set('list', target.playlistId)
  params.set('index', String(Math.max(activeIndex, 0)))

  return `https://www.youtube.com/embed/videoseries?${params.toString()}`
}

function targetLabel(target: YoutubeTarget, copy: AppCopy['youtube']) {
  return target.type === 'playlist' ? copy.playlist : copy.video
}

function errorCopy(code: number, copy: AppCopy['youtube']) {
  if (code === 101 || code === 150) {
    return copy.blocked
  }

  if (code === 100) {
    return copy.videoUnavailable
  }

  return copy.playError
}

function findVideoIndex(videos: YoutubePlaylistVideo[], videoId?: string) {
  return resolveVideoIndex(videos, videoId).index
}

function resolveVideoIndex(videos: YoutubePlaylistVideo[], videoId?: string) {
  if (!videoId) {
    return { index: 0, matched: true }
  }

  const index = videos.findIndex((video) => video.videoId === videoId)
  return { index: index >= 0 ? index : 0, matched: index >= 0 }
}

function buildSeedPlaylistData(playlistId: string, videoId: string) {
  const seeded = buildIframePlaylistData(playlistId, [videoId])

  return {
    ...seeded,
    source: 'seed' as const,
    videoCount: null,
  }
}

function normalizePlaylistOrder(value: unknown): PlaylistOrder {
  return value === 'desc' ? 'desc' : 'asc'
}

function hasGeneratedTitle(video: YoutubePlaylistVideo) {
  const normalized = video.title.trim()

  return (
    normalized === `Video ${video.index + 1}` || /^Video \d+$/i.test(normalized)
  )
}

function displayVideoTitle(
  video: YoutubePlaylistVideo,
  copy: AppCopy['youtube'],
) {
  return hasGeneratedTitle(video) ? copy.titlePending : video.title
}

function displayVideoMeta(
  video: YoutubePlaylistVideo,
  isActive: boolean,
  copy: AppCopy['youtube'],
) {
  if (isActive) {
    return copy.nowPlaying
  }

  if (hasGeneratedTitle(video)) {
    return video.uploader || copy.video
  }

  return video.uploader || copy.video
}

type YoutubeWidgetProps = {
  copy: AppCopy['youtube']
}

export function YoutubeWidget({ copy }: YoutubeWidgetProps) {
  const [youtubeUrl, setYoutubeUrl] = usePersistentState(
    'youtube:url',
    YOUTUBE_DEFAULT_URL,
  )
  const [playlistOrder, setPlaylistOrder] = usePersistentState<PlaylistOrder>(
    'youtube:playlistOrder',
    'asc',
  )
  const [watchedVideos, setWatchedVideos] =
    usePersistentState<WatchedVideosByPlaylist>('youtube:watchedVideos', {})
  const effectiveYoutubeUrl =
    youtubeUrl === legacyYoutubeUrl ? YOUTUBE_DEFAULT_URL : youtubeUrl
  const target = useMemo(
    () => parseYoutubeTarget(effectiveYoutubeUrl),
    [effectiveYoutubeUrl],
  )
  const currentPlayerKey = useMemo(() => playerKey(target), [target])
  const playerIframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const targetRef = useRef(target)
  const playlistDataRef = useRef<YoutubePlaylistData | null>(null)
  const activeIndexRef = useRef(0)
  const fallbackIndexRef = useRef(0)
  const metadataRequestKeyRef = useRef('')
  const metadataRetryTimerRef = useRef<number | null>(null)
  const skipTimerRef = useRef<number | null>(null)
  const skipAttemptsRef = useRef(0)
  const playbackIntentRef = useRef(false)
  const startAppliedKeyRef = useRef('')
  const [playlistData, setPlaylistData] = useState<YoutubePlaylistData | null>(null)
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [playlistLoadingMore, setPlaylistLoadingMore] = useState(false)
  const [playlistError, setPlaylistError] = useState('')
  const [metadataRetryTick, setMetadataRetryTick] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [fallbackIndex, setFallbackIndex] = useState(0)
  const [fallbackAutoplay, setFallbackAutoplay] = useState(false)
  const [playerStatus, setPlayerStatus] = useState<YouTubePlayerStatus>({
    error: '',
    notice: copy.ready,
    playerKey: '',
    ready: false,
  })
  const playerReady =
    playerStatus.playerKey === currentPlayerKey && playerStatus.ready
  const notice =
    playerStatus.playerKey === currentPlayerKey
      ? playerStatus.notice
      : copy.ready
  const playerError =
    playerStatus.playerKey === currentPlayerKey ? playerStatus.error : ''
  const playlistVideos = useMemo(
    () => playlistData?.videos ?? [],
    [playlistData],
  )
  const normalizedPlaylistOrder = normalizePlaylistOrder(playlistOrder)
  const orderedPlaylistVideos = useMemo(
    () =>
      normalizedPlaylistOrder === 'desc'
        ? [...playlistVideos].reverse()
        : playlistVideos,
    [normalizedPlaylistOrder, playlistVideos],
  )
  const visibleGeneratedVideoIds = useMemo(
    () =>
      orderedPlaylistVideos
        .filter(hasGeneratedTitle)
        .slice(0, 12)
        .map((video) => video.videoId),
    [orderedPlaylistVideos],
  )
  const isPlaylist = target.type === 'playlist'
  const activePlaylistId = isPlaylist ? target.playlistId : ''
  const watchedForPlaylist = useMemo(
    () => (activePlaylistId ? watchedVideos[activePlaylistId] ?? {} : {}),
    [activePlaylistId, watchedVideos],
  )
  const watchedCount = useMemo(
    () =>
      isPlaylist
        ? playlistVideos.filter((video) => watchedForPlaylist[video.videoId])
            .length
        : 0,
    [isPlaylist, playlistVideos, watchedForPlaylist],
  )
  const watchProgress = playlistVideos.length
    ? Math.round((watchedCount / playlistVideos.length) * 100)
    : 0
  const lastWatchedVideo = useMemo(() => {
    if (!isPlaylist) {
      return null
    }

    return [...playlistVideos]
      .filter((video) => watchedForPlaylist[video.videoId])
      .sort((first, second) => second.index - first.index)[0] ?? null
  }, [isPlaylist, playlistVideos, watchedForPlaylist])
  const playlistTitle =
    isPlaylist && playlistData?.title
      ? playlistData.title
      : targetLabel(target, copy)
  const playlistMeta =
    isPlaylist && playlistData?.videoCount
      ? copy.videos(playlistData.videoCount)
      : isPlaylist
        ? copy.videos(playlistVideos.length)
        : ''
  const playlistBlockingError = playlistError && !playlistVideos.length
    ? playlistError
    : ''
  const embedSrc = useMemo(
    () => iframeSrc(target, fallbackIndex, fallbackAutoplay),
    [fallbackAutoplay, fallbackIndex, target],
  )

  const cuePlaylistAt = useCallback((index: number) => {
    const currentTarget = targetRef.current

    if (currentTarget.type !== 'playlist') {
      return
    }

    playerRef.current?.cuePlaylist?.({
      index,
      list: currentTarget.playlistId,
      listType: 'playlist',
    })
    setActiveIndex(index)
  }, [])

  const syncPlaylistFromPlayer = useCallback((player: YouTubePlayer) => {
    const currentTarget = targetRef.current

    if (currentTarget.type !== 'playlist') {
      return
    }

    const ids = player.getPlaylist?.() ?? []
    const index = player.getPlaylistIndex?.() ?? -1

    if (index >= 0) {
      setActiveIndex(index)
    }

    if (!ids.length) {
      return
    }

    const fallback = buildIframePlaylistData(currentTarget.playlistId, ids)
    const startMatch = resolveVideoIndex(fallback.videos, currentTarget.startVideoId)

    if (
      currentTarget.startVideoId &&
      startMatch.matched &&
      startAppliedKeyRef.current !== playerKey(currentTarget)
    ) {
      startAppliedKeyRef.current = playerKey(currentTarget)
      cuePlaylistAt(startMatch.index)
    }

    setPlaylistData((current) => {
      if (!current?.videos.length) {
        playlistDataRef.current = fallback
        return fallback
      }

      if (current.source === 'seed') {
        playlistDataRef.current = fallback
        return fallback
      }

      if (current.source !== 'iframe') {
        const aligned = alignPlaylistDataToOfficialOrder(current, fallback)
        playlistDataRef.current = aligned
        return aligned
      }

      const merged = mergePlaylistData(current, fallback)
      playlistDataRef.current = merged
      return merged
    })
  }, [cuePlaylistAt])

  useEffect(() => {
    targetRef.current = target
  }, [target])

  useEffect(() => {
    playlistDataRef.current = playlistData
  }, [playlistData])

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    fallbackIndexRef.current = fallbackIndex
  }, [fallbackIndex])

  useEffect(() => {
    if (youtubeUrl === legacyYoutubeUrl) {
      setYoutubeUrl(YOUTUBE_DEFAULT_URL)
    }
  }, [setYoutubeUrl, youtubeUrl])

  useEffect(() => {
    if (!playlistData || !playlistNeedsVideoMetadata(playlistData)) {
      return
    }

    const requestKey = `${VIDEO_METADATA_REQUEST_VERSION}:${normalizedPlaylistOrder}:${playlistData.playlistId}:${visibleGeneratedVideoIds.join(',')}:${playlistData.videos
      .filter(hasGeneratedTitle)
      .map((video) => video.videoId)
      .join(',')}`

    if (!requestKey || metadataRequestKeyRef.current === requestKey) {
      return
    }

    let cancelled = false
    metadataRequestKeyRef.current = requestKey
    const scheduleRetry = () => {
      if (cancelled) {
        return
      }

      if (metadataRetryTimerRef.current) {
        window.clearTimeout(metadataRetryTimerRef.current)
      }

      metadataRetryTimerRef.current = window.setTimeout(() => {
        metadataRequestKeyRef.current = ''
        setMetadataRetryTick((value) => value + 1)
      }, VIDEO_METADATA_RETRY_DELAY)
    }

    const applyEnrichedData = (enriched: YoutubePlaylistData) => {
      if (cancelled) {
        return
      }

      setPlaylistData((current) => {
        if (!current || current.playlistId !== enriched.playlistId) {
          return current
        }

        const merged = mergePlaylistData(current, enriched)
        playlistDataRef.current = merged
        return merged
      })
    }

    enrichPlaylistDataWithVideoMetadata(
      playlistData,
      applyEnrichedData,
      visibleGeneratedVideoIds,
    )
      .then((enriched) => {
        if (enriched !== playlistData) {
          applyEnrichedData(enriched)
        }

        if (playlistNeedsVideoMetadata(enriched)) {
          scheduleRetry()
        }
      })
      .catch(scheduleRetry)

    return () => {
      cancelled = true

      if (metadataRetryTimerRef.current) {
        window.clearTimeout(metadataRetryTimerRef.current)
      }
    }
  }, [
    metadataRetryTick,
    normalizedPlaylistOrder,
    playlistData,
    visibleGeneratedVideoIds,
  ])

  const skipUnavailableVideo = useCallback((player?: YouTubePlayer) => {
    const currentTarget = targetRef.current

    if (currentTarget.type !== 'playlist') {
      return false
    }

    const playerIndex = player?.getPlaylistIndex?.()
    const currentIndex =
      typeof playerIndex === 'number' && playerIndex >= 0
        ? playerIndex
        : activeIndexRef.current
    const playerLength = player?.getPlaylist?.()?.length ?? 0
    const metadataLength =
      playlistDataRef.current?.playlistId === currentTarget.playlistId
        ? playlistDataRef.current.videos.length
        : 0
    const nextIndex = currentIndex + 1
    const maxLength = Math.max(playerLength, metadataLength)

    if (!maxLength || nextIndex >= maxLength) {
      return false
    }

    playbackIntentRef.current = true
    setActiveIndex(nextIndex)
    setFallbackIndex(nextIndex)
    setFallbackAutoplay(true)
    player?.playVideoAt?.(nextIndex)

    return true
  }, [])

  useEffect(() => {
    let cancelled = false

    if (target.type !== 'playlist') {
      window.queueMicrotask(() => {
        if (cancelled) {
          return
        }

        setPlaylistData(null)
        setPlaylistLoading(false)
        setPlaylistError('')
        setActiveIndex(0)
        setFallbackIndex(0)
        setFallbackAutoplay(false)
      })

      return () => {
        cancelled = true
      }
    }

    const cached = readCachedPlaylist(target.playlistId)
    const seeded = cached ?? (
      target.startVideoId
        ? buildSeedPlaylistData(target.playlistId, target.startVideoId)
        : null
    )

    window.queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setPlaylistData(seeded)
      setPlaylistLoading(true)
      setPlaylistError(cached ? copy.metadataLimited : '')
      setActiveIndex(findVideoIndex(seeded?.videos ?? [], target.startVideoId))
      setFallbackIndex(findVideoIndex(seeded?.videos ?? [], target.startVideoId))
      setFallbackAutoplay(false)
    })

    fetchPlaylistMetadata(target.playlistId)
      .then((data) => {
        if (cancelled) {
          return
        }

        if (!data) {
          setPlaylistError(copy.metadataLimited)
          return
        }

        const currentPlaylist = playlistDataRef.current
        const nextPlaylist =
          currentPlaylist?.playlistId === data.playlistId &&
          currentPlaylist.videos.length &&
          currentPlaylist.source !== 'seed'
            ? mergePlaylistData(currentPlaylist, data)
            : data
        const startMatch = resolveVideoIndex(
          nextPlaylist.videos,
          target.startVideoId,
        )

        setPlaylistData(nextPlaylist)
        playlistDataRef.current = nextPlaylist
        setPlaylistError('')

        if (!playbackIntentRef.current) {
          setActiveIndex(startMatch.index)
          setFallbackIndex(startMatch.index)
        }

        if (
          target.startVideoId &&
          startMatch.matched &&
          playerRef.current &&
          startAppliedKeyRef.current !== currentPlayerKey
        ) {
          startAppliedKeyRef.current = currentPlayerKey
          cuePlaylistAt(startMatch.index)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlaylistError(copy.metadataLimited)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPlaylistLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [copy.metadataLimited, currentPlayerKey, cuePlaylistAt, target])

  useEffect(() => {
    let cancelled = false
    const keyForPlayer = currentPlayerKey
    const iframe = playerIframeRef.current

    skipAttemptsRef.current = 0
    startAppliedKeyRef.current = ''
    window.queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setPlayerStatus({
        error: '',
        notice: copy.ready,
        playerKey: keyForPlayer,
        ready: false,
      })
    })

    loadYouTubeApi()
      .then((yt) => {
        if (cancelled || !iframe) {
          return
        }

        const player = new yt.Player(iframe, {
          videoId: targetRef.current.type === 'video' ? targetRef.current.videoId : undefined,
          playerVars: playerVars(targetRef.current),
          events: {
            onReady: (event) => {
              if (cancelled) {
                return
              }

              const iframe = event.target.getIframe()
              iframe.setAttribute('title', copy.playerTitle)
              iframe.classList.add('youtube-embed')

              const currentTarget = targetRef.current

              if (currentTarget.type === 'playlist') {
                const currentPlaylist =
                  playlistDataRef.current?.playlistId === currentTarget.playlistId
                    ? playlistDataRef.current
                    : null
                const authoritativeVideos =
                  currentPlaylist?.source === 'seed'
                    ? []
                    : currentPlaylist?.videos ?? []
                const startMatch = resolveVideoIndex(
                  authoritativeVideos,
                  currentTarget.startVideoId,
                )
                const preferredIndex = playbackIntentRef.current
                  ? fallbackIndexRef.current
                  : startMatch.index
                event.target.cuePlaylist?.({
                  index: preferredIndex,
                  list: currentTarget.playlistId,
                  listType: 'playlist',
                })
                setActiveIndex(preferredIndex)
                setFallbackIndex(preferredIndex)

                if (
                  playbackIntentRef.current ||
                  !currentTarget.startVideoId ||
                  startMatch.matched
                ) {
                  startAppliedKeyRef.current = keyForPlayer
                }

                window.setTimeout(() => syncPlaylistFromPlayer(event.target), 700)
              } else {
                event.target.cueVideoById?.(currentTarget.videoId)
              }

              setPlayerStatus({
                error: '',
                notice: copy.ready,
                playerKey: keyForPlayer,
                ready: true,
              })
            },
            onError: (event) => {
              const currentTarget = targetRef.current
              const player = event.target

              if (currentTarget.type !== 'playlist') {
                setPlayerStatus({
                  error: copy.pasteAnother,
                  notice: copy.unavailable,
                  playerKey: keyForPlayer,
                  ready: true,
                })
                return
              }

              const playlistLength = player.getPlaylist?.()?.length ?? 0
              const maxAttempts = Math.max(playlistLength, 10)

              if (skipAttemptsRef.current >= maxAttempts) {
                setPlayerStatus({
                  error: copy.tooManyUnavailable,
                  notice: copy.unavailable,
                  playerKey: keyForPlayer,
                  ready: true,
                })
                return
              }

              skipAttemptsRef.current += 1
              setPlayerStatus((current) =>
                current.playerKey === keyForPlayer
                  ? {
                      ...current,
                      error: '',
                      notice: errorCopy(event.data, copy),
                    }
                  : current,
              )

              if (skipTimerRef.current) {
                window.clearTimeout(skipTimerRef.current)
              }

              skipTimerRef.current = window.setTimeout(() => {
                const skipped = skipUnavailableVideo(player)

                if (!skipped) {
                  setPlayerStatus({
                    error: copy.tooManyUnavailable,
                    notice: copy.unavailable,
                    playerKey: keyForPlayer,
                    ready: true,
                  })
                }
              }, 350)
            },
            onStateChange: (event) => {
              syncPlaylistFromPlayer(event.target)

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
                  current.playerKey === keyForPlayer
                    ? {
                        ...current,
                        error: '',
                        notice: copy.playing,
                      }
                    : current,
                )
              }

              if (event.data === PLAYER_STATE.paused) {
                setPlayerStatus((current) =>
                  current.playerKey === keyForPlayer
                    ? {
                        ...current,
                        notice: copy.paused,
                      }
                    : current,
                )
              }

              if (event.data === PLAYER_STATE.cued) {
                setPlayerStatus((current) =>
                  current.playerKey === keyForPlayer
                    ? {
                        ...current,
                        notice: copy.ready,
                      }
                    : current,
                )
              }
            },
          },
        })
        playerRef.current = player
      })
      .catch(() => {
        if (!cancelled) {
          setPlayerStatus({
            error: '',
            notice: copy.ready,
            playerKey: keyForPlayer,
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
  }, [copy, currentPlayerKey, skipUnavailableVideo, syncPlaylistFromPlayer])

  const saveUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const nextUrl = String(data.get('youtube-url') ?? '').trim()

    setYoutubeUrl(nextUrl || YOUTUBE_DEFAULT_URL)
    window.dispatchEvent(new CustomEvent('msp:guide-action', {
      detail: { action: 'youtube-url-saved' },
    }))
  }

  const changePlaylistOrder = (event: ChangeEvent<HTMLSelectElement>) => {
    setPlaylistOrder(normalizePlaylistOrder(event.target.value))
  }

  const playPlaylistItem = (index: number) => {
    playbackIntentRef.current = true
    setActiveIndex(index)
    setFallbackIndex(index)
    setFallbackAutoplay(true)

    if (playerReady) {
      playerRef.current?.playVideoAt?.(index)
    }
  }

  const toggleWatched = (video: YoutubePlaylistVideo) => {
    if (target.type !== 'playlist') {
      return
    }

    const playlistId = target.playlistId

    setWatchedVideos((current) => {
      const currentPlaylist = current[playlistId] ?? {}
      const nextPlaylist = { ...currentPlaylist }

      if (nextPlaylist[video.videoId]) {
        delete nextPlaylist[video.videoId]
      } else {
        nextPlaylist[video.videoId] = true
      }

      return {
        ...current,
        [playlistId]: nextPlaylist,
      }
    })
    window.dispatchEvent(new CustomEvent('msp:guide-action', {
      detail: { action: 'youtube-watched-toggled', id: video.videoId },
    }))
  }

  const goToPrevious = () => {
    if (!isPlaylist || !playlistVideos.length || activeIndex <= 0) {
      return
    }

    const nextIndex = activeIndex - 1
    playbackIntentRef.current = true
    setActiveIndex(nextIndex)
    setFallbackIndex(nextIndex)
    setFallbackAutoplay(true)

    if (playerReady) {
      playerRef.current?.previousVideo?.()
    }
  }

  const goToNext = () => {
    if (
      !isPlaylist ||
      !playlistVideos.length ||
      activeIndex >= playlistVideos.length - 1
    ) {
      return
    }

    const nextIndex = activeIndex + 1
    playbackIntentRef.current = true
    setActiveIndex(nextIndex)
    setFallbackIndex(nextIndex)
    setFallbackAutoplay(true)

    if (playerReady) {
      playerRef.current?.nextVideo()
    }
  }

  const loadMore = async () => {
    if (!playlistData || playlistLoadingMore) {
      return
    }

    setPlaylistLoadingMore(true)
    setPlaylistError('')

    try {
      const next = await fetchNextPlaylistPage(playlistData)

      if (next) {
        setPlaylistData(next)
      } else {
        setPlaylistError(copy.metadataLimited)
      }
    } catch {
      setPlaylistError(copy.metadataLimited)
    } finally {
      setPlaylistLoadingMore(false)
    }
  }

  return (
    <div
      className={`media-widget youtube-widget${isPlaylist ? ' has-playlist' : ''}`}
      data-player-ready={playerReady ? 'true' : 'false'}
      data-youtube-active-index={isPlaylist ? String(activeIndex) : ''}
      data-youtube-kind={target.type}
      data-youtube-playlist-id={isPlaylist ? target.playlistId : ''}
      data-youtube-video-id={target.type === 'video' ? target.videoId : ''}
    >
      <div className="youtube-player-column">
        <div className="youtube-shell">
          <iframe
            key={currentPlayerKey}
            ref={playerIframeRef}
            className="youtube-embed"
            src={embedSrc}
            title={copy.playerTitle}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="youtube-meta-row">
          <span>{targetLabel(target, copy)}</span>
          <strong>{notice}</strong>
          {isPlaylist ? (
            <div className="youtube-player-controls">
              <button
                type="button"
                aria-label={copy.previous}
                onClick={goToPrevious}
                disabled={!playlistVideos.length || activeIndex <= 0}
              >
                <ChevronLeft size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label={copy.next}
                onClick={goToNext}
                disabled={
                  !playlistVideos.length || activeIndex >= playlistVideos.length - 1
                }
              >
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>
          ) : null}
        </div>
        {playerError ? <p className="youtube-error">{playerError}</p> : null}
        <form className="url-form" data-guide="youtube-url-form" onSubmit={saveUrl}>
          <input
            key={effectiveYoutubeUrl}
            name="youtube-url"
            defaultValue={effectiveYoutubeUrl}
            aria-label={copy.url}
          />
          <button type="submit" aria-label={copy.saveUrl}>
            <Save size={15} strokeWidth={1.9} />
          </button>
        </form>
      </div>

      {isPlaylist ? (
        <aside className="youtube-playlist-panel" aria-label={copy.playlist}>
          <div className="youtube-playlist-header">
            <div className="youtube-playlist-heading">
              <span>
                <ListVideo size={15} strokeWidth={1.9} />
                <strong>{playlistTitle}</strong>
              </span>
              <small>{playlistLoading ? copy.loadingPlaylist : playlistMeta}</small>
              {playlistVideos.length ? (
                <div className="youtube-watch-summary">
                  <div
                    className="youtube-watch-progress"
                    aria-label={copy.watchProgress(
                      watchedCount,
                      playlistVideos.length,
                    )}
                  >
                    <span style={{ width: `${watchProgress}%` }} />
                  </div>
                  <small>
                    {copy.watchProgress(watchedCount, playlistVideos.length)}
                    {lastWatchedVideo
                      ? ` · ${copy.lastWatched(
                          displayVideoTitle(lastWatchedVideo, copy),
                        )}`
                      : ''}
                  </small>
                </div>
              ) : null}
            </div>
            <select
              aria-label={copy.playlistOrderAria}
              className="youtube-order-select"
              onChange={changePlaylistOrder}
              value={normalizedPlaylistOrder}
            >
              <option value="asc">{copy.orderAsc}</option>
              <option value="desc">{copy.orderDesc}</option>
            </select>
          </div>

          {playlistBlockingError ? (
            <p className="youtube-error">{playlistBlockingError}</p>
          ) : null}

          <div className="youtube-playlist-list">
            {orderedPlaylistVideos.length ? (
              orderedPlaylistVideos.map((video, displayIndex) => {
                const title = displayVideoTitle(video, copy)
                const isActive = video.index === activeIndex
                const isWatched = Boolean(watchedForPlaylist[video.videoId])

                return (
                  <div
                    key={`${video.videoId}-${video.index}`}
                    className={`youtube-playlist-item${
                      isActive ? ' is-active' : ''
                    }${isWatched ? ' is-watched' : ''}`}
                    data-active={isActive ? 'true' : 'false'}
                    data-watched={isWatched ? 'true' : 'false'}
                  >
                    <button
                      className="youtube-playlist-main"
                      type="button"
                      aria-label={copy.playItem(title, video.index + 1)}
                      onClick={() => playPlaylistItem(video.index)}
                    >
                      <span className="youtube-playlist-index">
                        {isActive ? (
                          <Play size={12} strokeWidth={2} />
                        ) : (
                          video.index + 1
                        )}
                      </span>
                      <span className="youtube-thumb">
                        <img alt="" loading="lazy" src={video.thumbnail} />
                        {video.durationLabel ? <small>{video.durationLabel}</small> : null}
                      </span>
                      <span className="youtube-playlist-copy">
                        <strong>{title}</strong>
                        <small>{displayVideoMeta(video, isActive, copy)}</small>
                      </span>
                    </button>
                    <button
                      className={`youtube-watch-button${isWatched ? ' is-watched' : ''}`}
                      type="button"
                      data-guide={displayIndex === 0 ? 'youtube-mark-watched' : undefined}
                      aria-label={
                        isWatched ? copy.markUnwatched(title) : copy.markWatched(title)
                      }
                      title={isWatched ? copy.markUnwatched(title) : copy.markWatched(title)}
                      onClick={() => toggleWatched(video)}
                    >
                      <Check size={13} strokeWidth={2.2} />
                      <span>{isWatched ? copy.watched : copy.notWatched}</span>
                    </button>
                  </div>
                )
              })
            ) : (
              <div className="youtube-playlist-empty">
                {playlistLoading ? copy.loadingPlaylist : copy.playlistUnavailable}
              </div>
            )}
          </div>

          {playlistData?.nextPage ? (
            <button
              className="youtube-load-more"
              type="button"
              onClick={loadMore}
              disabled={playlistLoadingMore}
            >
              {playlistLoadingMore ? copy.loadingPlaylist : copy.loadMore}
            </button>
          ) : null}
        </aside>
      ) : null}
    </div>
  )
}
