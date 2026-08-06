import type {
  GoogleCalendarSyncState,
  RevisionCourse,
  RevisionEvent,
} from '../types/app'
import {
  addDaysToDateKey,
  normalizeGoogleCalendarSync,
  revisionOffsetLabel,
} from './revisions'

export const GOOGLE_CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar.events.owned'

type TokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
}

type TokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (options: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
          }) => TokenClient
        }
      }
    }
  }
}

let googleIdentityScriptPromise: Promise<void> | null = null

function envValue(value: string | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function getGoogleCalendarClientId() {
  return envValue(import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID)
}

export function isGoogleCalendarConfigured() {
  return Boolean(getGoogleCalendarClientId())
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve()
  }

  googleIdentityScriptPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-msp-google-identity]',
    )

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('gis_load_failed')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.mspGoogleIdentity = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('gis_load_failed'))
    document.head.append(script)
  })

  return googleIdentityScriptPromise
}

export async function requestGoogleCalendarAccessToken() {
  const clientId = getGoogleCalendarClientId()

  if (!clientId) {
    throw new Error('google_calendar_not_configured')
  }

  await loadGoogleIdentityScript()

  const oauth = window.google?.accounts?.oauth2

  if (!oauth) {
    throw new Error('google_identity_unavailable')
  }

  return new Promise<string>((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(
            new Error(response.error_description || response.error || 'oauth_error'),
          )
          return
        }

        if (!response.access_token) {
          reject(new Error('missing_google_access_token'))
          return
        }

        resolve(response.access_token)
      },
    })

    client.requestAccessToken({ prompt: 'consent' })
  })
}

function googleCalendarUrl(path = '') {
  return `https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`
}

type GoogleCalendarErrorBody = {
  error?: {
    errors?: Array<{
      domain?: string
      reason?: string
      message?: string
    }>
    status?: string
    message?: string
  }
}

async function isGoogleCalendarRateLimitError(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | GoogleCalendarErrorBody
    | null
  const details = [
    body?.error?.status,
    body?.error?.message,
    ...(body?.error?.errors ?? []).flatMap((error) => [
      error.domain,
      error.reason,
      error.message,
    ]),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')

  return /(?:userRateLimitExceeded|rateLimitExceeded|quotaExceeded|dailyLimitExceeded|RESOURCE_EXHAUSTED|usageLimits|rate limit|quota|usage limit)/i.test(
    details,
  )
}

async function googleCalendarRequest<T>(
  accessToken: string,
  path: string,
  options: RequestInit,
) {
  const response = await fetch(googleCalendarUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })

  if (response.status === 404 || response.status === 410) {
    throw new Error('google_event_not_found')
  }

  if (response.status === 401) {
    throw new Error('google_calendar_auth_expired')
  }

  if (
    response.status === 429 ||
    (response.status === 403 && (await isGoogleCalendarRateLimitError(response)))
  ) {
    throw new Error('google_calendar_rate_limited')
  }

  if (response.status === 403) {
    throw new Error('google_calendar_forbidden')
  }

  if (!response.ok) {
    throw new Error(`google_calendar_${response.status}`)
  }

  return (await response.json().catch(() => ({}))) as T
}

function addOneHour(date: string, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const next = new Date()
  const [year, month, day] = date.split('-').map(Number)
  next.setFullYear(year, month - 1, day)
  next.setHours(hours + 1, minutes, 0, 0)

  const nextDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
  const nextTime = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`

  return { date: nextDate, time: nextTime }
}

function eventBody(
  event: RevisionEvent,
  course: RevisionCourse | undefined,
  timezone: string,
) {
  const label = revisionOffsetLabel(course, event)
  const summary = course?.title ? `${label} - ${course.title}` : label
  const details = [
    'Muslim Study Place',
    course?.part ? `Part: ${course.part}` : '',
    course?.professor ? `Teacher: ${course.professor}` : '',
    course?.notes ? `Notes: ${course.notes}` : '',
    `Status: ${event.status}`,
  ].filter(Boolean)

  return {
    summary,
    description: details.join('\n'),
    start: event.scheduledTime
      ? {
          dateTime: `${event.scheduledDate}T${event.scheduledTime}:00`,
          timeZone: timezone,
        }
      : { date: event.scheduledDate },
    end: event.scheduledTime
      ? {
          dateTime: `${addOneHour(event.scheduledDate, event.scheduledTime).date}T${addOneHour(event.scheduledDate, event.scheduledTime).time}:00`,
          timeZone: timezone,
        }
      : { date: addDaysToDateKey(event.scheduledDate, 1) },
    extendedProperties: {
      private: {
        mspRevisionEventId: event.id,
        mspCourseId: event.courseId,
      },
    },
  }
}

type GoogleEventResponse = {
  id?: string
  extendedProperties?: {
    private?: Record<string, string>
  }
}

type GoogleEventListResponse = {
  items?: GoogleEventResponse[]
}

async function findExistingGoogleEvents(
  accessToken: string,
  revisionEventId: string,
) {
  const query = new URLSearchParams({
    privateExtendedProperty: `mspRevisionEventId=${revisionEventId}`,
    maxResults: '10',
    singleEvents: 'true',
    showDeleted: 'false',
  })
  const response = await googleCalendarRequest<GoogleEventListResponse>(
    accessToken,
    `?${query.toString()}`,
    { method: 'GET' },
  )

  return (response.items ?? []).filter(
    (item) =>
      item.id &&
      item.extendedProperties?.private?.mspRevisionEventId === revisionEventId,
  )
}

export async function syncRevisionEventsToGoogleCalendar({
  state,
  events,
  courses,
  accessToken,
  timezone,
}: {
  state: GoogleCalendarSyncState
  events: RevisionEvent[]
  courses: RevisionCourse[]
  accessToken: string
  timezone: string
}) {
  const current = normalizeGoogleCalendarSync(state)
  const nextMap = { ...current.eventMap }
  const coursesById = new Map(courses.map((course) => [course.id, course]))
  const eventsById = new Map(events.map((event) => [event.id, event]))
  const summary = {
    created: 0,
    updated: 0,
    deleted: 0,
    repaired: 0,
    skipped: 0,
  }

  for (const [eventId, link] of Object.entries(current.eventMap)) {
    if (eventsById.has(eventId)) {
      continue
    }

    await googleCalendarRequest(accessToken, `/${encodeURIComponent(link.googleEventId)}`, {
      method: 'DELETE',
    }).catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== 'google_event_not_found') {
        throw error
      }
    })
    delete nextMap[eventId]
    summary.deleted += 1
  }

  for (const event of events) {
    const course = coursesById.get(event.courseId)
    const body = eventBody(event, course, timezone)
    const existing = nextMap[event.id]
    let googleEventId: string | undefined = existing?.googleEventId

    if (googleEventId) {
      try {
        await googleCalendarRequest(
          accessToken,
          `/${encodeURIComponent(googleEventId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          },
        )
        summary.updated += 1
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'google_event_not_found') {
          throw error
        }

        googleEventId = undefined
      }
    }

    if (!googleEventId) {
      const existingMatches = await findExistingGoogleEvents(accessToken, event.id)
      const existing = existingMatches[0]

      if (existing?.id) {
        googleEventId = existing.id
        await googleCalendarRequest(
          accessToken,
          `/${encodeURIComponent(googleEventId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          },
        )
        summary.repaired += 1

        for (const duplicate of existingMatches.slice(1)) {
          if (!duplicate.id) {
            continue
          }

          await googleCalendarRequest(
            accessToken,
            `/${encodeURIComponent(duplicate.id)}`,
            { method: 'DELETE' },
          )
          summary.deleted += 1
        }
      }
    }

    if (!googleEventId) {
      const created = await googleCalendarRequest<GoogleEventResponse>(
        accessToken,
        '',
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      )
      googleEventId = created.id
      summary.created += 1
    }

    if (!googleEventId) {
      throw new Error('google_event_missing_id')
    }

    const savedGoogleEventId = googleEventId

    nextMap[event.id] = {
      revisionEventId: event.id,
      googleEventId: savedGoogleEventId,
      syncedAt: Date.now(),
    }
  }

  return {
    enabled: true,
    lastSyncedAt: Date.now(),
    lastError: null,
    lastSummary: summary,
    eventMap: nextMap,
  }
}
