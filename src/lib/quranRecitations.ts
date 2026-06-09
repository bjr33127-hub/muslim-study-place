const ARCHIVE_ITEM_ID = '20240229_20240229_1756'
const ARCHIVE_BASE_URL = `https://archive.org/download/${ARCHIVE_ITEM_ID}`
export const QURAN_ARCHIVE_URL = `https://archive.org/details/${ARCHIVE_ITEM_ID}`

export type QuranRecitation = {
  id: string
  label: string
  detail: string
  fileName: string
  sourceUrl: string
}

function archiveAudioUrl(fileName: string) {
  return `${ARCHIVE_BASE_URL}/${encodeURIComponent(fileName)}`
}

export const QURAN_RECITATIONS: QuranRecitation[] = [
  {
    id: 'baqarah',
    label: 'Al-Baqarah',
    detail: 'Surah Al-Baqarah',
    fileName: '002  2  الأكثر طلبا واستماعا - سورة البقرة - Surah Al-Baqarah.mp3',
    sourceUrl: QURAN_ARCHIVE_URL,
  },
  {
    id: 'yusuf',
    label: 'Yusuf',
    detail: 'Surah Yusuf',
    fileName: '012   12  سورة يوسف - Surah Yusuf.mp3',
    sourceUrl: QURAN_ARCHIVE_URL,
  },
  {
    id: 'anfal',
    label: 'Al-Anfal',
    detail: 'Surah Al-Anfal',
    fileName: '008   8   سورة الأنفال - Surah Al-Anfal.mp3',
    sourceUrl: QURAN_ARCHIVE_URL,
  },
  {
    id: 'furqan',
    label: 'Al-Furqan',
    detail: 'Surah Al-Furqan',
    fileName: '0025   25  سورة الفرقان - Surah Al-Furqan.mp3',
    sourceUrl: QURAN_ARCHIVE_URL,
  },
  {
    id: 'ibrahim',
    label: 'Ibrahim',
    detail: 'Surah Ibrahim',
    fileName: '004  14  سورة إبراهيم - Surah Ibrahim.mp3',
    sourceUrl: QURAN_ARCHIVE_URL,
  },
]

export const DEFAULT_QURAN_RECITATION_ID = QURAN_RECITATIONS[0].id

export function quranRecitationSrc(recitation: QuranRecitation) {
  return archiveAudioUrl(recitation.fileName)
}

export function findQuranRecitation(id: string) {
  return (
    QURAN_RECITATIONS.find((recitation) => recitation.id === id) ??
    QURAN_RECITATIONS[0]
  )
}
