const STORAGE_PREFIX = 'muslim-study-place:youtube:playlist:'
const OEMBED_STORAGE_PREFIX = 'muslim-study-place:youtube:oembed:'
const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7
const OEMBED_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 30
const FETCH_TIMEOUT = 6500
const OEMBED_FETCH_TIMEOUT = 4200
const OEMBED_BATCH_SIZE = 8

const PIPED_BASE_URLS = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.darkness.services',
]

const INVIDIOUS_BASE_URLS = [
  'https://inv.nadeko.net',
  'https://iv.ggtyler.dev',
  'https://invidious.nerdvpn.de',
  'https://inv.us.projectsegfau.lt',
]

export type YoutubePlaylistSource =
  | 'cache'
  | 'piped'
  | 'invidious'
  | 'iframe'
  | 'seed'

export type YoutubePlaylistVideo = {
  videoId: string
  title: string
  thumbnail: string
  index: number
  durationLabel?: string
  durationSeconds?: number
  uploader?: string
}

export type YoutubePlaylistData = {
  playlistId: string
  title: string
  uploader: string
  videoCount: number | null
  videos: YoutubePlaylistVideo[]
  nextPage: string | number | null
  source: YoutubePlaylistSource
}

type CacheRecord = {
  savedAt: number
  data: YoutubePlaylistData
}

type OEmbedCacheRecord = {
  savedAt: number
  data: YoutubeVideoMetadata
}

type YoutubeVideoMetadata = {
  title: string
  thumbnail: string
  uploader: string
}

type YoutubeOEmbedResponse = {
  author_name?: string
  thumbnail_url?: string
  title?: string
}

type NoembedJsonpWindow = Window & {
  [callbackName: string]: ((payload: YoutubeOEmbedResponse) => void) | undefined
}

type PipedPlaylistResponse = {
  name?: string
  uploader?: string
  thumbnailUrl?: string
  nextpage?: string
  relatedStreams?: Array<{
    duration?: number
    thumbnail?: string
    title?: string
    uploaderName?: string
    uploader?: string
    url?: string
  }>
}

type InvidiousPlaylistResponse = {
  title?: string
  author?: string
  videoCount?: number
  videos?: Array<{
    author?: string
    index?: number
    lengthSeconds?: number
    title?: string
    videoId?: string
    videoThumbnails?: Array<{
      quality?: string
      url?: string
      width?: number
    }>
  }>
}

export function readCachedPlaylist(playlistId: string) {
  try {
    const raw = window.localStorage.getItem(cacheKey(playlistId))

    if (!raw) {
      return null
    }

    const record = JSON.parse(raw) as Partial<CacheRecord>

    if (
      !record.savedAt ||
      Date.now() - record.savedAt > CACHE_MAX_AGE ||
      !record.data ||
      record.data.playlistId !== playlistId ||
      !Array.isArray(record.data.videos)
    ) {
      return null
    }

    return {
      ...record.data,
      nextPage: record.data.nextPage ?? null,
    }
  } catch {
    return null
  }
}

export function writeCachedPlaylist(data: YoutubePlaylistData) {
  if (data.source === 'iframe' || data.source === 'seed' || !data.videos.length) {
    return
  }

  try {
    window.localStorage.setItem(
      cacheKey(data.playlistId),
      JSON.stringify({
        savedAt: Date.now(),
        data,
      } satisfies CacheRecord),
    )
  } catch {
    // Metadata cache is optional; playback must keep working without it.
  }
}

export async function fetchPlaylistMetadata(playlistId: string) {
  const piped = await fetchFromPiped(playlistId)

  if (piped) {
    writeCachedPlaylist(piped)
    return piped
  }

  const invidious = await fetchFromInvidious(playlistId)

  if (invidious) {
    writeCachedPlaylist(invidious)
    return invidious
  }

  return null
}

export async function fetchNextPlaylistPage(current: YoutubePlaylistData) {
  if (!current.nextPage) {
    return null
  }

  if (current.source === 'piped' || current.source === 'cache') {
    const piped = await fetchFromPiped(current.playlistId, String(current.nextPage))
    return piped ? mergePlaylistData(current, piped) : null
  }

  if (current.source === 'invidious') {
    const invidious = await fetchFromInvidious(
      current.playlistId,
      Number(current.nextPage),
    )
    return invidious ? mergePlaylistData(current, invidious) : null
  }

  return null
}

export function buildIframePlaylistData(
  playlistId: string,
  videoIds: string[],
): YoutubePlaylistData {
  return {
    playlistId,
    title: '',
    uploader: '',
    videoCount: videoIds.length,
    videos: videoIds.map((videoId, index) => ({
      videoId,
      title: `Video ${index + 1}`,
      thumbnail: youtubeThumbnail(videoId),
      index,
    })),
    nextPage: null,
    source: 'iframe',
  }
}

export function playlistNeedsVideoMetadata(data: YoutubePlaylistData) {
  return data.videos.some((video) => isGeneratedTitle(video.title, video.index))
}

export async function enrichPlaylistDataWithVideoMetadata(
  data: YoutubePlaylistData,
  onBatch?: (data: YoutubePlaylistData) => void,
  priorityVideoIds: string[] = [],
): Promise<YoutubePlaylistData> {
  const generatedVideos = data.videos.filter((video) =>
    isGeneratedTitle(video.title, video.index),
  )
  const generatedById = new Map(
    generatedVideos.map((video) => [video.videoId, video]),
  )
  const priorityIds = new Set(priorityVideoIds)
  const priorityVideos = priorityVideoIds
    .map((videoId) => generatedById.get(videoId))
    .filter((video): video is YoutubePlaylistVideo => Boolean(video))
  const remainingVideos = generatedVideos.filter(
    (video) => !priorityIds.has(video.videoId),
  )
  const videosToEnrich = [...priorityVideos, ...remainingVideos]

  if (!videosToEnrich.length) {
    return data
  }

  const metadataById = new Map<string, YoutubeVideoMetadata>()
  let enrichedData = data

  for (let index = 0; index < videosToEnrich.length; index += OEMBED_BATCH_SIZE) {
    const batch = videosToEnrich.slice(index, index + OEMBED_BATCH_SIZE)
    const records = await Promise.all(
      batch.map(async (video) => ({
        metadata: await fetchVideoMetadata(video.videoId),
        videoId: video.videoId,
      })),
    )

    records.forEach((record) => {
      if (record.metadata) {
        metadataById.set(record.videoId, record.metadata)
      }
    })

    if (metadataById.size) {
      enrichedData = applyVideoMetadata(data, metadataById)
      onBatch?.(enrichedData)
    }
  }

  if (!metadataById.size) {
    return data
  }

  return enrichedData
}

function applyVideoMetadata(
  data: YoutubePlaylistData,
  metadataById: Map<string, YoutubeVideoMetadata>,
) {
  return {
    ...data,
    videos: data.videos.map((video) => {
      const metadata = metadataById.get(video.videoId)

      if (!metadata) {
        return video
      }

      return {
        ...video,
        thumbnail: metadata.thumbnail || video.thumbnail,
        title: metadata.title || video.title,
        uploader: metadata.uploader || video.uploader,
      }
    }),
  }
}

export function mergePlaylistData(
  current: YoutubePlaylistData,
  next: YoutubePlaylistData,
): YoutubePlaylistData {
  const videos = [...current.videos]

  next.videos.forEach((video) => {
    const existingIndex = videos.findIndex((item) => item.videoId === video.videoId)

    if (existingIndex >= 0) {
      videos[existingIndex] = mergePlaylistVideo(
        videos[existingIndex],
        video,
        videos[existingIndex].index,
      )
      return
    }

    videos.push(mergePlaylistVideo(video, undefined, videos.length))
  })

  const merged: YoutubePlaylistData = {
    ...current,
    title: current.title || next.title,
    uploader: current.uploader || next.uploader,
    videoCount: next.videoCount ?? current.videoCount,
    videos,
    nextPage: next.nextPage,
    source:
      current.source === 'cache' || current.source === 'seed'
        ? next.source
        : current.source,
  }

  writeCachedPlaylist(merged)
  return merged
}

function mergePlaylistVideo(
  base: YoutubePlaylistVideo,
  incoming?: YoutubePlaylistVideo,
  index = base.index,
): YoutubePlaylistVideo {
  const cachedVideoMetadata = readCachedVideoMetadata(base.videoId)
  const title = chooseVideoTitle(base, incoming, cachedVideoMetadata)
  const thumbnail =
    cachedVideoMetadata?.thumbnail ||
    incoming?.thumbnail ||
    base.thumbnail ||
    youtubeThumbnail(base.videoId)
  const uploader =
    cachedVideoMetadata?.uploader || incoming?.uploader || base.uploader

  return {
    ...base,
    ...incoming,
    thumbnail,
    title,
    uploader,
    index,
  }
}

function chooseVideoTitle(
  base: YoutubePlaylistVideo,
  incoming?: YoutubePlaylistVideo,
  cachedVideoMetadata?: YoutubeVideoMetadata | null,
) {
  const cachedTitle = cachedVideoMetadata?.title?.trim()

  if (cachedTitle) {
    return cachedTitle
  }

  if (incoming && hasSpecificTitle(incoming)) {
    return incoming.title
  }

  if (hasSpecificTitle(base)) {
    return base.title
  }

  return base.title?.trim() || incoming?.title?.trim() || `Video ${base.index + 1}`
}

function hasSpecificTitle(video: YoutubePlaylistVideo) {
  const title = video.title.trim()
  const uploader = video.uploader?.trim()

  return Boolean(
    title &&
      !isGeneratedTitle(title, video.index) &&
      (!uploader || title !== uploader),
  )
}

export function alignPlaylistDataToOfficialOrder(
  current: YoutubePlaylistData,
  officialOrder: YoutubePlaylistData,
): YoutubePlaylistData {
  const metadataById = new Map(
    current.videos.map((video) => [video.videoId, video]),
  )
  const officialIds = new Set(officialOrder.videos.map((video) => video.videoId))
  const orderedVideos = officialOrder.videos.map((officialVideo, index) => {
    const metadata = metadataById.get(officialVideo.videoId)

    return mergePlaylistVideo(officialVideo, metadata, index)
  })
  const remainingMetadata = current.videos
    .filter((video) => !officialIds.has(video.videoId))
    .map((video, index) => ({
      ...video,
      index: orderedVideos.length + index,
    }))
  const videoCount =
    current.videoCount ??
    officialOrder.videoCount ??
    orderedVideos.length + remainingMetadata.length
  const aligned: YoutubePlaylistData = {
    ...current,
    title: current.title || officialOrder.title,
    uploader: current.uploader || officialOrder.uploader,
    videoCount,
    videos: [...orderedVideos, ...remainingMetadata],
    source: current.source === 'seed' ? officialOrder.source : current.source,
  }

  writeCachedPlaylist(aligned)
  return aligned
}

async function fetchFromPiped(playlistId: string, nextPage?: string) {
  for (const baseUrl of PIPED_BASE_URLS) {
    const endpoint = nextPage
      ? `${baseUrl}/nextpage/playlists/${encodeURIComponent(
          playlistId,
        )}?nextpage=${encodeURIComponent(nextPage)}`
      : `${baseUrl}/playlists/${encodeURIComponent(playlistId)}`

    try {
      const payload = await fetchJson<PipedPlaylistResponse>(endpoint)
      const normalized = normalizePipedPlaylist(payload, playlistId)

      if (normalized.videos.length) {
        return normalized
      }
    } catch {
      // Public metadata instances are best-effort.
    }
  }

  return null
}

async function fetchFromInvidious(playlistId: string, page = 1) {
  for (const baseUrl of INVIDIOUS_BASE_URLS) {
    const endpoint = `${baseUrl}/api/v1/playlists/${encodeURIComponent(
      playlistId,
    )}${page > 1 ? `?page=${page}` : ''}`

    try {
      const payload = await fetchJson<InvidiousPlaylistResponse>(endpoint)
      const normalized = normalizeInvidiousPlaylist(payload, playlistId, page)

      if (normalized.videos.length) {
        return normalized
      }
    } catch {
      // Public metadata instances are best-effort.
    }
  }

  return null
}

async function fetchJson<T>(url: string, timeoutMs = FETCH_TIMEOUT) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`)
    }

    return (await response.json()) as T
  } finally {
    window.clearTimeout(timeout)
  }
}

function normalizePipedPlaylist(
  payload: PipedPlaylistResponse,
  playlistId: string,
): YoutubePlaylistData {
  const videos = (payload.relatedStreams ?? [])
    .map((item, index): YoutubePlaylistVideo | null => {
      const videoId = videoIdFromWatchUrl(item.url ?? '')

      if (!videoId) {
        return null
      }

      return {
        videoId,
        title: cleanTitle(item.title, index),
        thumbnail: item.thumbnail || youtubeThumbnail(videoId),
        durationLabel: formatDuration(item.duration),
        durationSeconds: item.duration,
        uploader: item.uploaderName || item.uploader || undefined,
        index,
      }
    })
    .filter((item): item is YoutubePlaylistVideo => Boolean(item))

  return {
    playlistId,
    title: payload.name ?? '',
    uploader: payload.uploader ?? '',
    videoCount: null,
    videos,
    nextPage: payload.nextpage || null,
    source: 'piped',
  }
}

function normalizeInvidiousPlaylist(
  payload: InvidiousPlaylistResponse,
  playlistId: string,
  page: number,
): YoutubePlaylistData {
  const videos = (payload.videos ?? [])
    .map((item, index): YoutubePlaylistVideo | null => {
      if (!item.videoId) {
        return null
      }

      return {
        videoId: item.videoId,
        title: cleanTitle(item.title, index),
        thumbnail: bestInvidiousThumbnail(item) || youtubeThumbnail(item.videoId),
        durationLabel: formatDuration(item.lengthSeconds),
        durationSeconds: item.lengthSeconds,
        uploader: item.author,
        index,
      }
    })
    .filter((item): item is YoutubePlaylistVideo => Boolean(item))

  const videoCount = typeof payload.videoCount === 'number' ? payload.videoCount : null
  const nextPage =
    videoCount && videos.length && page * videos.length < videoCount ? page + 1 : null

  return {
    playlistId,
    title: payload.title ?? '',
    uploader: payload.author ?? '',
    videoCount,
    videos,
    nextPage,
    source: 'invidious',
  }
}

function bestInvidiousThumbnail(item: NonNullable<InvidiousPlaylistResponse['videos']>[number]) {
  return [...(item.videoThumbnails ?? [])]
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url
}

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) {
    return undefined
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function videoIdFromWatchUrl(url: string) {
  try {
    const parsed = new URL(url, 'https://www.youtube.com')
    const videoId = parsed.searchParams.get('v')

    return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null
  } catch {
    return null
  }
}

function cleanTitle(title: string | undefined, index: number) {
  const normalized = title?.trim()
  return normalized || `Video ${index + 1}`
}

async function fetchVideoMetadata(videoId: string) {
  const cached = readCachedVideoMetadata(videoId)

  if (cached) {
    return cached
  }

  try {
    const payload = await fetchVideoMetadataPayload(videoId)
    const title = payload?.title?.trim()

    if (!payload || !title) {
      return null
    }

    const metadata = {
      thumbnail: payload.thumbnail_url || youtubeThumbnail(videoId),
      title,
      uploader: payload.author_name?.trim() ?? '',
    }

    writeCachedVideoMetadata(videoId, metadata)
    return metadata
  } catch {
    return null
  }
}

async function fetchVideoMetadataPayload(videoId: string) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  const youtubeOembedUrl = new URL('https://www.youtube.com/oembed')
  youtubeOembedUrl.searchParams.set('format', 'json')
  youtubeOembedUrl.searchParams.set('url', videoUrl)
  const noembedUrl = new URL('https://noembed.com/embed')
  noembedUrl.searchParams.set('url', videoUrl)

  return firstValidVideoMetadataPayload([
    fetchJson<YoutubeOEmbedResponse>(
      youtubeOembedUrl.toString(),
      OEMBED_FETCH_TIMEOUT,
    ).catch(() => null),
    fetchJson<YoutubeOEmbedResponse>(
      noembedUrl.toString(),
      OEMBED_FETCH_TIMEOUT,
    ).catch(() => null),
    fetchNoembedJsonp(videoId),
  ])
}

function firstValidVideoMetadataPayload(
  attempts: Array<Promise<YoutubeOEmbedResponse | null>>,
) {
  return new Promise<YoutubeOEmbedResponse | null>((resolve) => {
    let settled = false
    let pending = attempts.length

    attempts.forEach((attempt) => {
      attempt
        .then((payload) => {
          if (settled) {
            return
          }

          if (payload?.title?.trim()) {
            settled = true
            resolve(payload)
            return
          }

          pending -= 1

          if (pending === 0) {
            resolve(null)
          }
        })
        .catch(() => {
          if (settled) {
            return
          }

          pending -= 1

          if (pending === 0) {
            resolve(null)
          }
        })
    })
  })
}

function fetchNoembedJsonp(videoId: string) {
  const callbackName = `__mspYoutubeTitle_${videoId.replace(
    /[^a-zA-Z0-9_]/g,
    '',
  )}_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const callbackWindow = window as unknown as NoembedJsonpWindow

  return new Promise<YoutubeOEmbedResponse | null>((resolve) => {
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => finish(null), OEMBED_FETCH_TIMEOUT)
    let settled = false

    function finish(payload: YoutubeOEmbedResponse | null) {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeout)
      script.remove()
      delete callbackWindow[callbackName]
      resolve(payload?.title?.trim() ? payload : null)
    }

    callbackWindow[callbackName] = finish
    script.async = true
    script.onerror = () => finish(null)
    script.src = `https://noembed.com/embed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&callback=${encodeURIComponent(callbackName)}`
    document.head.appendChild(script)
  })
}

function readCachedVideoMetadata(videoId: string) {
  try {
    const raw = window.localStorage.getItem(oembedCacheKey(videoId))

    if (!raw) {
      return null
    }

    const record = JSON.parse(raw) as Partial<OEmbedCacheRecord>

    if (
      !record.savedAt ||
      Date.now() - record.savedAt > OEMBED_CACHE_MAX_AGE ||
      !record.data ||
      !record.data.title
    ) {
      return null
    }

    return record.data
  } catch {
    return null
  }
}

function writeCachedVideoMetadata(
  videoId: string,
  metadata: YoutubeVideoMetadata,
) {
  try {
    window.localStorage.setItem(
      oembedCacheKey(videoId),
      JSON.stringify({
        data: metadata,
        savedAt: Date.now(),
      } satisfies OEmbedCacheRecord),
    )
  } catch {
    // Per-video title cache is optional.
  }
}

function isGeneratedTitle(title: string, index: number) {
  const normalized = title.trim()

  return normalized === `Video ${index + 1}` || /^Video \d+$/i.test(normalized)
}

function youtubeThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}

function cacheKey(playlistId: string) {
  return STORAGE_PREFIX + playlistId
}

function oembedCacheKey(videoId: string) {
  return OEMBED_STORAGE_PREFIX + videoId
}
