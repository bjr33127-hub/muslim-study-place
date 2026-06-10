const QURAN_API_BASE = 'https://api.quran.com/api/v4'

export type QuranReciter = {
  id: number
  reciterName: string
  style: string | null
}

export type QuranChapter = {
  id: number
  name: string
}

type QuranApiRecitation = {
  id: number
  reciter_name?: string
  style?: string | null
}

type QuranApiRecitationsResponse = {
  recitations?: QuranApiRecitation[]
}

type QuranApiAudioResponse = {
  audio_file?: {
    audio_url?: string
  }
}

export const DEFAULT_QURAN_RECITER_ID = 7
export const DEFAULT_QURAN_CHAPTER_ID = 1

export const FALLBACK_QURAN_RECITERS: QuranReciter[] = [
  { id: 7, reciterName: 'Mishari Rashid al-Afasy', style: null },
  { id: 3, reciterName: 'Abdur-Rahman as-Sudais', style: null },
  { id: 4, reciterName: 'Abu Bakr al-Shatri', style: null },
  { id: 5, reciterName: 'Hani ar-Rifai', style: null },
  { id: 6, reciterName: 'Mahmoud Khalil Al-Husary', style: null },
  { id: 9, reciterName: 'Mohamed Siddiq al-Minshawi', style: 'Murattal' },
  { id: 10, reciterName: 'Saud ash-Shuraym', style: null },
  { id: 11, reciterName: 'Mohamed al-Tablawi', style: null },
]

export const QURAN_CHAPTERS: QuranChapter[] = [
  { id: 1, name: 'Al-Fatihah' },
  { id: 2, name: 'Al-Baqarah' },
  { id: 3, name: 'Ali Imran' },
  { id: 4, name: 'An-Nisa' },
  { id: 5, name: 'Al-Maidah' },
  { id: 6, name: 'Al-Anam' },
  { id: 7, name: 'Al-Araf' },
  { id: 8, name: 'Al-Anfal' },
  { id: 9, name: 'At-Tawbah' },
  { id: 10, name: 'Yunus' },
  { id: 11, name: 'Hud' },
  { id: 12, name: 'Yusuf' },
  { id: 13, name: 'Ar-Rad' },
  { id: 14, name: 'Ibrahim' },
  { id: 15, name: 'Al-Hijr' },
  { id: 16, name: 'An-Nahl' },
  { id: 17, name: 'Al-Isra' },
  { id: 18, name: 'Al-Kahf' },
  { id: 19, name: 'Maryam' },
  { id: 20, name: 'Taha' },
  { id: 21, name: 'Al-Anbiya' },
  { id: 22, name: 'Al-Hajj' },
  { id: 23, name: 'Al-Muminun' },
  { id: 24, name: 'An-Nur' },
  { id: 25, name: 'Al-Furqan' },
  { id: 26, name: 'Ash-Shuara' },
  { id: 27, name: 'An-Naml' },
  { id: 28, name: 'Al-Qasas' },
  { id: 29, name: 'Al-Ankabut' },
  { id: 30, name: 'Ar-Rum' },
  { id: 31, name: 'Luqman' },
  { id: 32, name: 'As-Sajdah' },
  { id: 33, name: 'Al-Ahzab' },
  { id: 34, name: 'Saba' },
  { id: 35, name: 'Fatir' },
  { id: 36, name: 'Ya-Sin' },
  { id: 37, name: 'As-Saffat' },
  { id: 38, name: 'Sad' },
  { id: 39, name: 'Az-Zumar' },
  { id: 40, name: 'Ghafir' },
  { id: 41, name: 'Fussilat' },
  { id: 42, name: 'Ash-Shuraa' },
  { id: 43, name: 'Az-Zukhruf' },
  { id: 44, name: 'Ad-Dukhan' },
  { id: 45, name: 'Al-Jathiyah' },
  { id: 46, name: 'Al-Ahqaf' },
  { id: 47, name: 'Muhammad' },
  { id: 48, name: 'Al-Fath' },
  { id: 49, name: 'Al-Hujurat' },
  { id: 50, name: 'Qaf' },
  { id: 51, name: 'Adh-Dhariyat' },
  { id: 52, name: 'At-Tur' },
  { id: 53, name: 'An-Najm' },
  { id: 54, name: 'Al-Qamar' },
  { id: 55, name: 'Ar-Rahman' },
  { id: 56, name: 'Al-Waqiah' },
  { id: 57, name: 'Al-Hadid' },
  { id: 58, name: 'Al-Mujadila' },
  { id: 59, name: 'Al-Hashr' },
  { id: 60, name: 'Al-Mumtahanah' },
  { id: 61, name: 'As-Saff' },
  { id: 62, name: 'Al-Jumuah' },
  { id: 63, name: 'Al-Munafiqun' },
  { id: 64, name: 'At-Taghabun' },
  { id: 65, name: 'At-Talaq' },
  { id: 66, name: 'At-Tahrim' },
  { id: 67, name: 'Al-Mulk' },
  { id: 68, name: 'Al-Qalam' },
  { id: 69, name: 'Al-Haqqah' },
  { id: 70, name: 'Al-Maarij' },
  { id: 71, name: 'Nuh' },
  { id: 72, name: 'Al-Jinn' },
  { id: 73, name: 'Al-Muzzammil' },
  { id: 74, name: 'Al-Muddaththir' },
  { id: 75, name: 'Al-Qiyamah' },
  { id: 76, name: 'Al-Insan' },
  { id: 77, name: 'Al-Mursalat' },
  { id: 78, name: 'An-Naba' },
  { id: 79, name: 'An-Naziat' },
  { id: 80, name: 'Abasa' },
  { id: 81, name: 'At-Takwir' },
  { id: 82, name: 'Al-Infitar' },
  { id: 83, name: 'Al-Mutaffifin' },
  { id: 84, name: 'Al-Inshiqaq' },
  { id: 85, name: 'Al-Buruj' },
  { id: 86, name: 'At-Tariq' },
  { id: 87, name: 'Al-Ala' },
  { id: 88, name: 'Al-Ghashiyah' },
  { id: 89, name: 'Al-Fajr' },
  { id: 90, name: 'Al-Balad' },
  { id: 91, name: 'Ash-Shams' },
  { id: 92, name: 'Al-Layl' },
  { id: 93, name: 'Ad-Duha' },
  { id: 94, name: 'Ash-Sharh' },
  { id: 95, name: 'At-Tin' },
  { id: 96, name: 'Al-Alaq' },
  { id: 97, name: 'Al-Qadr' },
  { id: 98, name: 'Al-Bayyinah' },
  { id: 99, name: 'Az-Zalzalah' },
  { id: 100, name: 'Al-Adiyat' },
  { id: 101, name: 'Al-Qariah' },
  { id: 102, name: 'At-Takathur' },
  { id: 103, name: 'Al-Asr' },
  { id: 104, name: 'Al-Humazah' },
  { id: 105, name: 'Al-Fil' },
  { id: 106, name: 'Quraysh' },
  { id: 107, name: 'Al-Maun' },
  { id: 108, name: 'Al-Kawthar' },
  { id: 109, name: 'Al-Kafirun' },
  { id: 110, name: 'An-Nasr' },
  { id: 111, name: 'Al-Masad' },
  { id: 112, name: 'Al-Ikhlas' },
  { id: 113, name: 'Al-Falaq' },
  { id: 114, name: 'An-Nas' },
]

export function quranReciterLabel(reciter: QuranReciter) {
  return reciter.style
    ? `${reciter.reciterName} - ${reciter.style}`
    : reciter.reciterName
}

export function findQuranChapter(id: number) {
  return (
    QURAN_CHAPTERS.find((chapter) => chapter.id === id) ??
    QURAN_CHAPTERS[DEFAULT_QURAN_CHAPTER_ID - 1]
  )
}

export function normalizeQuranReciters(data: QuranApiRecitationsResponse) {
  const reciters =
    data.recitations?.flatMap((reciter) => {
      if (!reciter.id || !reciter.reciter_name) {
        return []
      }

      return [
        {
          id: reciter.id,
          reciterName: reciter.reciter_name.replace(/`/g, "'"),
          style: reciter.style ?? null,
        },
      ]
    }) ?? []

  return reciters.length ? reciters : FALLBACK_QURAN_RECITERS
}

export async function fetchQuranReciters(signal?: AbortSignal) {
  const response = await fetch(
    `${QURAN_API_BASE}/resources/recitations?language=en`,
    { signal },
  )

  if (!response.ok) {
    throw new Error('Quran reciters could not be loaded.')
  }

  return normalizeQuranReciters(await response.json())
}

export async function fetchQuranChapterAudio(
  reciterId: number,
  chapterId: number,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `${QURAN_API_BASE}/chapter_recitations/${reciterId}/${chapterId}`,
    { signal },
  )

  if (!response.ok) {
    throw new Error('Quran audio could not be loaded.')
  }

  const data = (await response.json()) as QuranApiAudioResponse
  const audioUrl = data.audio_file?.audio_url

  if (!audioUrl) {
    throw new Error('Quran audio URL is missing.')
  }

  return audioUrl
}
