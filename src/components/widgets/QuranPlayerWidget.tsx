import {
  AudioLines,
  ExternalLink,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  Waves,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { usePersistentState } from '../../hooks/usePersistentState'
import {
  DEFAULT_QURAN_RECITATION_ID,
  QURAN_RECITATIONS,
  findQuranRecitation,
  quranRecitationSrc,
} from '../../lib/quranRecitations'

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00'
  }

  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

export function QuranPlayerWidget() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const shouldResumeRef = useRef(false)
  const [selectedId, setSelectedId] = usePersistentState(
    'quran:selectedRecitation',
    DEFAULT_QURAN_RECITATION_ID,
  )
  const [volume, setVolume] = usePersistentState('quran:volume', 76)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playerError, setPlayerError] = useState('')
  const selected = findQuranRecitation(selectedId)
  const selectedIndex = Math.max(
    QURAN_RECITATIONS.findIndex((recitation) => recitation.id === selected.id),
    0,
  )
  const audioSrc = useMemo(() => quranRecitationSrc(selected), [selected])
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0

  const playAudio = async () => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    setPlayerError('')
    audio.volume = volume / 100
    setIsPlaying(true)

    try {
      await audio.play()
    } catch {
      setIsPlaying(false)
      setPlayerError('Playback needs one more tap.')
    }
  }

  const pauseAudio = () => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }

  const chooseRecitation = (id: string, resume = isPlaying) => {
    shouldResumeRef.current = resume
    setPlayerError('')
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    setSelectedId(id)
  }

  const selectByOffset = (offset: number, resume = isPlaying) => {
    const nextIndex =
      (selectedIndex + offset + QURAN_RECITATIONS.length) %
      QURAN_RECITATIONS.length
    chooseRecitation(QURAN_RECITATIONS[nextIndex].id, resume)
  }

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

  const seekToProgress = (nextProgress: number) => {
    const audio = audioRef.current

    if (!audio || duration <= 0) {
      return
    }

    const nextTime = (Math.min(Math.max(nextProgress, 0), 100) / 100) * duration
    audio.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  return (
    <div
      className="quran-player-widget"
      data-player-state={isPlaying ? 'playing' : 'paused'}
      data-audio-src={audioSrc}
    >
      <audio
        ref={audioRef}
        className="quran-audio-element"
        src={audioSrc}
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
        onEnded={() => selectByOffset(1, true)}
      />

      <div className="quran-liquid-stage">
        <div className="quran-liquid-mark" aria-hidden="true">
          <AudioLines size={32} strokeWidth={1.7} />
          <span />
        </div>
        <div className="quran-copy">
          <p>Quran recitation</p>
          <h3>Omar Diaa Aldeen</h3>
          <strong>{selected.label}</strong>
          <span>{selected.detail}</span>
        </div>
      </div>

      <div className="quran-wave-panel" aria-label="Quran audio progress">
        <div className="quran-wave-bars" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} style={{ '--bar': index } as CSSProperties} />
          ))}
        </div>
        <div className="quran-time-row">
          <span>{formatDuration(currentTime)}</span>
          <strong>{isPlaying ? 'Playing' : 'Ready'}</strong>
          <span>{formatDuration(duration)}</span>
        </div>
        <input
          aria-label="Quran progress"
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={(event) => seekToProgress(Number(event.target.value))}
        />
      </div>

      <div className="quran-controls" aria-label="Quran player controls">
        <button
          type="button"
          aria-label="Previous recitation"
          onClick={() => selectByOffset(-1)}
        >
          <SkipBack size={16} strokeWidth={1.9} />
        </button>
        <button
          className="quran-play-button"
          type="button"
          aria-label={isPlaying ? 'Pause Quran recitation' : 'Play Quran recitation'}
          onClick={togglePlayback}
        >
          {isPlaying ? (
            <Pause size={19} strokeWidth={2} />
          ) : (
            <Play size={19} strokeWidth={2} />
          )}
        </button>
        <button
          type="button"
          aria-label="Next recitation"
          onClick={() => selectByOffset(1)}
        >
          <SkipForward size={16} strokeWidth={1.9} />
        </button>
        <label className="quran-volume">
          <Volume2 size={15} strokeWidth={1.8} />
          <input
            aria-label="Quran volume"
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => updateVolume(Number(event.target.value))}
          />
        </label>
      </div>

      {playerError ? <p className="quran-player-error">{playerError}</p> : null}

      <div className="quran-recitation-list" aria-label="Omar recitations">
        {QURAN_RECITATIONS.map((recitation) => (
          <button
            key={recitation.id}
            className={recitation.id === selected.id ? 'is-selected' : ''}
            type="button"
            onClick={() => chooseRecitation(recitation.id, false)}
          >
            <Waves size={14} strokeWidth={1.8} />
            <span>
              <strong>{recitation.label}</strong>
              <small>{recitation.detail}</small>
            </span>
          </button>
        ))}
      </div>

      <a
        className="quran-source-link"
        href={selected.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        Source
        <ExternalLink size={13} strokeWidth={1.9} />
      </a>
    </div>
  )
}
