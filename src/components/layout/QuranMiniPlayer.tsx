import {
  ChevronDown,
  ExternalLink,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  Waves,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { usePersistentState } from '../../hooks/usePersistentState'
import {
  DEFAULT_QURAN_CHAPTER_ID,
  DEFAULT_QURAN_RECITER_ID,
  FALLBACK_QURAN_RECITERS,
  QURAN_CHAPTERS,
  fetchQuranChapterAudio,
  fetchQuranReciters,
  findQuranChapter,
  quranReciterLabel,
} from '../../lib/quranApi'

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00'
  }

  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

export function QuranMiniPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const shouldResumeRef = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const [selectedReciterId, setSelectedReciterId] = usePersistentState(
    'quran:selectedReciter',
    DEFAULT_QURAN_RECITER_ID,
  )
  const [selectedChapterId, setSelectedChapterId] = usePersistentState(
    'quran:selectedChapter',
    DEFAULT_QURAN_CHAPTER_ID,
  )
  const [volume, setVolume] = usePersistentState('quran:volume', 76)
  const [reciters, setReciters] = useState(FALLBACK_QURAN_RECITERS)
  const [audioSrc, setAudioSrc] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isAudioLoading, setIsAudioLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playerError, setPlayerError] = useState('')
  const selectedReciter =
    reciters.find((reciter) => reciter.id === selectedReciterId) ??
    FALLBACK_QURAN_RECITERS[0]
  const selectedChapter = findQuranChapter(selectedChapterId)
  const selectedIndex = Math.max(
    QURAN_CHAPTERS.findIndex((chapter) => chapter.id === selectedChapter.id),
    0,
  )
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0
  const reciterLabel = useMemo(
    () => quranReciterLabel(selectedReciter),
    [selectedReciter],
  )

  useEffect(() => {
    const controller = new AbortController()

    fetchQuranReciters(controller.signal)
      .then((nextReciters) => {
        setReciters(nextReciters)

        if (!nextReciters.some((reciter) => reciter.id === selectedReciterId)) {
          setSelectedReciterId(DEFAULT_QURAN_RECITER_ID)
        }
      })
      .catch(() => {
        setPlayerError('Reciters API unavailable; using local list.')
      })

    return () => controller.abort()
  }, [selectedReciterId, setSelectedReciterId])

  useEffect(() => {
    if (selectedReciter.id !== selectedReciterId) {
      setSelectedReciterId(selectedReciter.id)
    }
  }, [selectedReciter.id, selectedReciterId, setSelectedReciterId])

  useEffect(() => {
    if (selectedChapter.id !== selectedChapterId) {
      setSelectedChapterId(selectedChapter.id)
    }
  }, [selectedChapter.id, selectedChapterId, setSelectedChapterId])

  const pauseAudio = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const playAudio = useCallback(async () => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    if (!audioSrc) {
      setPlayerError('Audio is still loading.')
      return
    }

    setPlayerError('')
    audio.volume = volume / 100
    setIsPlaying(true)

    try {
      await audio.play()
    } catch {
      setIsPlaying(false)
      setPlayerError('Tap play again to start.')
    }
  }, [audioSrc, volume])

  const chooseChapter = useCallback(
    (id: number, resume = false) => {
      shouldResumeRef.current = resume
      setPlayerError('')

      if (id === selectedChapter.id) {
        if (resume) {
          void playAudio()
        } else {
          pauseAudio()
        }

        return
      }

      if (!resume) {
        pauseAudio()
      }

      setCurrentTime(0)
      setDuration(0)
      setIsPlaying(false)
      setAudioSrc('')
      setIsAudioLoading(true)
      setSelectedChapterId(id)
    },
    [pauseAudio, playAudio, selectedChapter.id, setSelectedChapterId],
  )

  const chooseReciter = (id: number) => {
    shouldResumeRef.current = false
    pauseAudio()
    setPlayerError('')
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    setAudioSrc('')
    setIsAudioLoading(true)
    setSelectedReciterId(id)
  }

  const selectByOffset = useCallback(
    (offset: number) => {
      const nextIndex =
        (selectedIndex + offset + QURAN_CHAPTERS.length) % QURAN_CHAPTERS.length
      chooseChapter(QURAN_CHAPTERS[nextIndex].id, isPlaying)
    },
    [chooseChapter, isPlaying, selectedIndex],
  )

  useEffect(() => {
    const controller = new AbortController()

    fetchQuranChapterAudio(
      selectedReciter.id,
      selectedChapter.id,
      controller.signal,
    )
      .then((nextAudioSrc) => {
        setAudioSrc(nextAudioSrc)
        setPlayerError('')
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        shouldResumeRef.current = false
        setPlayerError('Quran audio API unavailable.')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsAudioLoading(false)
        }
      })

    return () => controller.abort()
  }, [selectedChapter.id, selectedReciter.id])

  useEffect(() => {
    const audio = audioRef.current

    return () => {
      audio?.pause()
    }
  }, [])

  const togglePlayback = () => {
    if (isPlaying) {
      pauseAudio()
      return
    }

    void playAudio()
  }

  const updateVolume = (nextVolume: number) => {
    const clamped = Math.min(Math.max(nextVolume, 0), 100)
    setVolume(clamped)

    if (audioRef.current) {
      audioRef.current.volume = clamped / 100
    }
  }

  const toggleExpanded = (event?: MouseEvent) => {
    event?.stopPropagation()
    setExpanded((current) => !current)
  }

  const stopControlPropagation = (event: MouseEvent) => {
    event.stopPropagation()
  }

  return (
    <section
      className={`quran-mini-player${expanded ? ' is-expanded' : ''}`}
      data-player-state={isPlaying ? 'playing' : 'paused'}
      data-expanded={expanded ? 'true' : 'false'}
      data-audio-src={audioSrc}
      data-reciter-id={selectedReciter.id}
      data-chapter-id={selectedChapter.id}
      aria-label="Quran mini player"
    >
      <audio
        ref={audioRef}
        className="quran-audio-element"
        src={audioSrc || undefined}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget
          audio.volume = volume / 100
          setDuration(audio.duration)

          if (shouldResumeRef.current) {
            shouldResumeRef.current = false
            void playAudio()
          }
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onEnded={() => setIsPlaying(false)}
      />

      <div className="quran-mini-shell" onClick={() => setExpanded((current) => !current)}>
        <div className="quran-mini-row">
          <button
            className="quran-mini-display"
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide Quran recitations' : 'Show Quran recitations'}
            onClick={toggleExpanded}
          >
            <span className="quran-mini-orb" aria-hidden="true">
              <Waves size={16} strokeWidth={1.9} />
            </span>
            <span className="quran-mini-copy">
              <small>{reciterLabel}</small>
              <strong>{selectedChapter.name}</strong>
            </span>
            <ChevronDown size={15} strokeWidth={1.9} aria-hidden="true" />
          </button>

          <div className="quran-mini-controls" onClick={stopControlPropagation}>
            <button
              type="button"
              aria-label="Previous Quran recitation"
              onClick={() => selectByOffset(-1)}
            >
              <SkipBack size={14} strokeWidth={2} />
            </button>
            <button
              className="quran-mini-play"
              type="button"
              aria-label={isPlaying ? 'Pause Quran recitation' : 'Play Quran recitation'}
              onClick={togglePlayback}
              disabled={isAudioLoading || !audioSrc}
            >
              {isPlaying ? (
                <Pause size={15} strokeWidth={2.2} />
              ) : (
                <Play size={15} strokeWidth={2.2} />
              )}
            </button>
            <button
              type="button"
              aria-label="Next Quran recitation"
              onClick={() => selectByOffset(1)}
            >
              <SkipForward size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className="quran-mini-progress" aria-label="Quran recitation progress">
          <span style={{ width: `${progress}%` }} />
        </div>

        {expanded ? (
          <div className="quran-mini-panel" onClick={stopControlPropagation}>
            <div className="quran-mini-meta">
              <span>{formatDuration(currentTime)}</span>
              <strong>{isAudioLoading ? 'Loading' : isPlaying ? 'Playing' : 'Paused'}</strong>
              <span>{formatDuration(duration)}</span>
            </div>
            <label className="quran-mini-select">
              <span>Reciter</span>
              <select
                aria-label="Quran reciter"
                value={selectedReciter.id}
                onChange={(event) => chooseReciter(Number(event.target.value))}
              >
                {reciters.map((reciter) => (
                  <option key={reciter.id} value={reciter.id}>
                    {quranReciterLabel(reciter)}
                  </option>
                ))}
              </select>
            </label>
            <label className="quran-mini-volume">
              <Volume2 size={13} strokeWidth={1.9} />
              <input
                aria-label="Quran volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(event) => updateVolume(Number(event.target.value))}
              />
            </label>
            <div className="quran-mini-list" aria-label="Quran chapters">
              {QURAN_CHAPTERS.map((chapter) => (
                <button
                  key={chapter.id}
                  className={chapter.id === selectedChapter.id ? 'is-selected' : ''}
                  type="button"
                  onClick={() => chooseChapter(chapter.id, false)}
                >
                  <span>
                    <strong>{chapter.name}</strong>
                    <small>Surah {String(chapter.id).padStart(3, '0')}</small>
                  </span>
                </button>
              ))}
            </div>
            <a
              className="quran-mini-source"
              href="https://quran.com"
              target="_blank"
              rel="noreferrer"
            >
              Quran.com API
              <ExternalLink size={12} strokeWidth={1.9} />
            </a>
            {playerError ? <p className="quran-mini-error">{playerError}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
