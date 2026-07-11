import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import timeGridPlugin from '@fullcalendar/timegrid'
import type {
  DatesSetArg,
  EventDropArg,
  EventClickArg,
  EventContentArg,
} from '@fullcalendar/core'
import type { DateClickArg } from '@fullcalendar/interaction'
import {
  CalendarDays,
  BookOpen,
  CheckCircle2,
  Edit3,
  RefreshCcw,
  Minus,
  Play,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { RevisionMethodsWidget } from '../widgets/RevisionMethodsWidget'
import type { AppCopy } from '../../lib/i18n'
import type { GuideTourStep } from './GuidePage'
import {
  REVISION_COLOR_PRESETS,
  REVISION_WEEKDAYS,
  buildRevisionEventsForCourse,
  completedEventsToday,
  completedEventsThisWeek,
  courseById,
  dateKey,
  formatShortDate,
  methodById,
  methodLabel,
  revisionOffsetLabel,
  revisionEventStart,
  revisionEventStatusForDay,
  revisionsDueToday,
  subjectById,
  todayRevisionEvents,
  timeKey,
  weekStartKey,
} from '../../lib/revisions'
import {
  TODO_DIFFICULTIES,
  TODO_PRIORITIES,
  clampPomodoros,
} from '../../lib/todos'
import type {
  RevisionCourse,
  RevisionEvent,
  RevisionMethod,
  RevisionSettings,
  RevisionSubject,
  RevisionWeekday,
  GoogleCalendarSyncState,
  TodoDifficulty,
  TodoPriority,
} from '../../types/app'

type PlannerView = RevisionSettings['plannerView']
type PlannerTab = 'today' | 'calendar' | 'courses' | 'methods'

type RevisionPlannerPageProps = {
  copy: AppCopy['revisions']
  todoCopy: AppCopy['todo']
  language: string
  courses: RevisionCourse[]
  subjects: RevisionSubject[]
  events: RevisionEvent[]
  methods: RevisionMethod[]
  settings: RevisionSettings
  googleCalendar: GoogleCalendarSyncState
  googleCalendarConfigured: boolean
  googleCalendarSessionConnected: boolean
  guideStep?: GuideTourStep
  onClose: () => void
  onSettingsChange: (settings: Partial<RevisionSettings>) => void
  onSaveCourse: (course: RevisionCourse) => void
  onSaveSubject: (subject: RevisionSubject) => void
  onDeleteSubject: (id: string) => void
  onDeleteCourse: (id: string) => void
  onDeleteEvent: (id: string) => void
  onStartEvent: (id: string) => void
  onMarkDone: (id: string) => void
  onConnectGoogleCalendar: () => void
  onSyncGoogleCalendar: () => void
  onRescheduleEvent: (
    id: string,
    scheduledDate: string,
    scheduledTime: string | null,
  ) => void
  onUpdateEvent: (
    id: string,
    patch: Partial<
      Pick<
        RevisionEvent,
        'priority' | 'difficulty' | 'requiredPomodoros' | 'completedPomodoros'
      >
    >,
  ) => void
  onSaveMethod: (method: RevisionMethod) => void
  onDeleteMethod: (id: string) => void
}

type CourseDraft = {
  id: string
  title: string
  initialDate: string
  professor: string
  part: string
  notes: string
  colorPresetId: string
  subjectId: string
  subjectName: string
  subjectColorPresetId: string
  methodId: string
  excludedWeekdays: RevisionWeekday[]
  createdAt: number
}

type CourseDraftStep = 0 | 1 | 2

const CALENDAR_VIEWS: PlannerView[] = [
  'dayGridMonth',
  'timeGridWeek',
  'timeGridDay',
  'listWeek',
]

const DEFAULT_METHOD_ID = 'method-classic'

function courseToDraft(course: RevisionCourse): CourseDraft {
  const preset =
    REVISION_COLOR_PRESETS.find((item) => item.color === course.color) ??
    REVISION_COLOR_PRESETS[0]

  return {
    id: course.id,
    title: course.title,
    initialDate: course.initialDate,
    professor: course.professor,
    part: course.part,
    notes: course.notes,
    colorPresetId: preset.id,
    subjectId: course.subjectId ?? '',
    subjectName: '',
    subjectColorPresetId: REVISION_COLOR_PRESETS[0].id,
    methodId: course.methodId ?? '',
    excludedWeekdays: course.excludedWeekdays,
    createdAt: course.createdAt,
  }
}

function newDraft(initialDate = dateKey()): CourseDraft {
  return {
    id: '',
    title: '',
    initialDate,
    professor: '',
    part: '',
    notes: '',
    colorPresetId: REVISION_COLOR_PRESETS[0].id,
    subjectId: '',
    subjectName: '',
    subjectColorPresetId: REVISION_COLOR_PRESETS[0].id,
    methodId: DEFAULT_METHOD_ID,
    excludedWeekdays: [],
    createdAt: new Date().getTime(),
  }
}

function eventLabel(
  copy: AppCopy['revisions'],
  course: RevisionCourse | undefined,
  event: RevisionEvent,
) {
  return revisionOffsetLabel(course, event, copy.revisionPrefix)
}

function viewLabel(copy: AppCopy['revisions'], view: PlannerView) {
  switch (view) {
    case 'timeGridWeek':
      return copy.viewWeek
    case 'timeGridDay':
      return copy.viewDay
    case 'listWeek':
      return copy.viewList
    case 'dayGridMonth':
    default:
      return copy.viewMonth
  }
}

export function RevisionPlannerPage({
  copy,
  todoCopy,
  language,
  courses,
  subjects,
  events,
  methods,
  settings,
  googleCalendar,
  googleCalendarConfigured,
  googleCalendarSessionConnected,
  guideStep,
  onClose,
  onSettingsChange,
  onSaveCourse,
  onSaveSubject,
  onDeleteSubject,
  onDeleteCourse,
  onDeleteEvent,
  onStartEvent,
  onMarkDone,
  onConnectGoogleCalendar,
  onSyncGoogleCalendar,
  onRescheduleEvent,
  onUpdateEvent,
  onSaveMethod,
  onDeleteMethod,
}: RevisionPlannerPageProps) {
  const calendarRef = useRef<FullCalendar | null>(null)
  const [tab, setTab] = useState<PlannerTab>(() =>
    guideStep === 'course-delete' ? 'courses' : 'today',
  )
  const [draft, setDraft] = useState<CourseDraft | null>(null)
  const [draftStep, setDraftStep] = useState<CourseDraftStep>(0)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [courseSubjectFilter, setCourseSubjectFilter] = useState('')
  const [todaySubjectFilter, setTodaySubjectFilter] = useState('')
  const coursesById = useMemo(() => courseById(courses), [courses])
  const subjectsById = useMemo(() => subjectById(subjects), [subjects])
  const methodsById = useMemo(() => methodById(methods), [methods])
  const selectedEvent = selectedEventId
    ? events.find((event) => event.id === selectedEventId) ?? null
    : null
  const selectedCourse = selectedEvent
    ? coursesById.get(selectedEvent.courseId) ?? null
    : null
  const initialDate = settings.plannerDate ?? dateKey()
  const plannerView = settings.plannerView
  const today = dateKey()
  const todayEvents = useMemo(
    () => todayRevisionEvents(events, today),
    [events, today],
  )
  const dueToday = useMemo(
    () => revisionsDueToday(todayEvents, today),
    [todayEvents, today],
  )
  const doneToday = useMemo(
    () => completedEventsToday(todayEvents, today),
    [todayEvents, today],
  )
  const doneWeek = useMemo(
    () => completedEventsThisWeek(events, weekStartKey(today)),
    [events, today],
  )
  const visibleDueToday = useMemo(
    () =>
      dueToday.filter((event) => {
        const subjectId = coursesById.get(event.courseId)?.subjectId ?? ''
        return todaySubjectFilter === 'none'
          ? !subjectId
          : !todaySubjectFilter || subjectId === todaySubjectFilter
      }),
    [coursesById, dueToday, todaySubjectFilter],
  )
  const courseEventsById = useMemo(() => {
    const next = new Map<string, RevisionEvent[]>()

    events.forEach((event) => {
      next.set(event.courseId, [...(next.get(event.courseId) ?? []), event])
    })

    return next
  }, [events])
  const sortedCourses = useMemo(
    () =>
      [...courses]
        .filter((course) =>
          courseSubjectFilter === 'none'
            ? !course.subjectId
            : !courseSubjectFilter || course.subjectId === courseSubjectFilter,
        )
        .sort((first, second) => second.updatedAt - first.updatedAt),
    [courseSubjectFilter, courses],
  )

  const calendarEvents = useMemo(
    () =>
      events.map((event) => {
        const course = coursesById.get(event.courseId)
        const subject = course?.subjectId ? subjectsById.get(course.subjectId) : undefined
        const progress = `${event.completedPomodoros}/${event.requiredPomodoros}`

        return {
          id: event.id,
          title: course?.title ?? copy.courseName,
          start: revisionEventStart(event),
          allDay: !event.scheduledTime,
          backgroundColor: subject?.color ?? course?.color ?? REVISION_COLOR_PRESETS[0].color,
          borderColor: subject?.color ?? course?.color ?? REVISION_COLOR_PRESETS[0].color,
          textColor: subject?.textColor ?? course?.textColor ?? REVISION_COLOR_PRESETS[0].textColor,
          extendedProps: {
            event,
            course,
            progress,
            status: revisionEventStatusForDay(event),
          },
        }
      }),
    [copy.courseName, coursesById, events, subjectsById],
  )

  const selectedPreset =
    REVISION_COLOR_PRESETS.find((item) => item.id === draft?.colorPresetId) ??
    REVISION_COLOR_PRESETS[0]
  const selectedMethod = draft?.methodId ? methodsById.get(draft.methodId) : null
  const selectedSubjectPreset =
    REVISION_COLOR_PRESETS.find((item) => item.id === draft?.subjectColorPresetId) ??
    REVISION_COLOR_PRESETS[0]
  const previewCourse: RevisionCourse | null = draft
    ? {
        id: draft.id || 'preview-course',
        title: draft.title || copy.courseName,
        initialDate: draft.initialDate || dateKey(),
        professor: draft.professor.trim(),
        part: draft.part.trim(),
        notes: draft.notes.trim(),
        color: selectedPreset.color,
        textColor: selectedPreset.textColor,
        subjectId: draft.subjectId === 'new' ? null : draft.subjectId || null,
        methodId: draft.methodId || null,
        excludedWeekdays: draft.excludedWeekdays,
        createdAt: draft.createdAt,
        updatedAt: draft.createdAt,
      }
    : null
  const previewEvents = previewCourse
    ? buildRevisionEventsForCourse(previewCourse, selectedMethod)
    : []
  const draftStepLabels = [
    copy.stepBasics,
    copy.stepDetails,
    copy.stepReview,
  ] as const
  const rawGoogleCalendarError = googleCalendar.lastError?.trim() ?? ''
  const normalizedGoogleCalendarError = rawGoogleCalendarError
    ? /(?:"code"\s*:\s*401|invalid authentication credentials|unauthori[sz]ed|oauth 2 access token)/i.test(
        rawGoogleCalendarError,
      )
      ? copy.googleCalendarAuthExpired
      : /^(?:\{|\[|<!doctype|<html)/i.test(rawGoogleCalendarError) || rawGoogleCalendarError.length > 280
        ? copy.googleCalendarSyncFailed
        : rawGoogleCalendarError
    : ''
  const googleCalendarStatus = !googleCalendarConfigured
    ? copy.googleCalendarConfiguredNeeded
    : normalizedGoogleCalendarError
      ? normalizedGoogleCalendarError
      : googleCalendarSessionConnected && googleCalendar.lastSyncedAt
        ? copy.googleCalendarSynced(
            new Date(googleCalendar.lastSyncedAt).toLocaleTimeString(language, {
              hour: '2-digit',
              minute: '2-digit',
            }),
          )
        : googleCalendarSessionConnected
          ? copy.googleCalendarConnected
          : copy.googleCalendarNeedsConnect
  const googleCalendarSummary = googleCalendar.lastSummary
    ? copy.googleCalendarSummary(
        googleCalendar.lastSummary.created,
        googleCalendar.lastSummary.updated,
        googleCalendar.lastSummary.deleted,
        googleCalendar.lastSummary.repaired,
      )
    : null

  const changeView = (view: PlannerView) => {
    calendarRef.current?.getApi().changeView(view)
    onSettingsChange({ plannerView: view })
  }

  useEffect(() => {
    const mobileMonthView =
      window.matchMedia('(max-width: 859px)').matches &&
      settings.plannerView === 'dayGridMonth'

    if (mobileMonthView) {
      calendarRef.current?.getApi().changeView('listWeek')
      onSettingsChange({ plannerView: 'listWeek' })
    }
  }, [onSettingsChange, settings.plannerView])

  const handleDatesSet = (arg: DatesSetArg) => {
    const view = CALENDAR_VIEWS.includes(arg.view.type as PlannerView)
      ? (arg.view.type as PlannerView)
      : 'dayGridMonth'

    onSettingsChange({
      plannerView: view,
      plannerDate: dateKey(arg.view.currentStart),
    })
  }

  const openNewCourse = (initialDateValue = dateKey()) => {
    setError('')
    setSelectedEventId(null)
    setDraftStep(0)
    setDraft(newDraft(initialDateValue))
  }

  const openEditCourse = (course: RevisionCourse) => {
    setError('')
    setSelectedEventId(null)
    setDraftStep(0)
    setDraft(courseToDraft(course))
  }

  const handleDateClick = (arg: DateClickArg) => {
    openNewCourse(dateKey(arg.date))
  }

  const handleEventClick = (arg: EventClickArg) => {
    setDraft(null)
    setSelectedEventId(arg.event.id)
  }

  const handleEventDrop = (arg: EventDropArg) => {
    const nextDate = arg.event.start

    if (!nextDate) {
      arg.revert()
      return
    }

    onRescheduleEvent(
      arg.event.id,
      dateKey(nextDate),
      arg.event.allDay ? null : timeKey(nextDate),
    )
  }

  const submitCourse = (event: FormEvent) => {
    event.preventDefault()

    if (!draft?.title.trim()) {
      setError(copy.requiredName)
      return
    }

    if (draft.subjectId === 'new' && !draft.subjectName.trim()) {
      setError(copy.requiredSubjectName)
      return
    }

    if (draftStep < 2) {
      setError('')
      setDraftStep((current) => Math.min(current + 1, 2) as CourseDraftStep)
      return
    }

    const now = new Date().getTime()
    const createdSubjectId =
      draft.subjectId === 'new' && draft.subjectName.trim()
        ? `revision-subject-${now}`
        : null

    if (createdSubjectId) {
      onSaveSubject({
        id: createdSubjectId,
        name: draft.subjectName.trim(),
        color: selectedSubjectPreset.color,
        textColor: selectedSubjectPreset.textColor,
        createdAt: now,
        updatedAt: now,
      })
    }

    onSaveCourse({
      id: draft.id || `revision-course-${now}`,
      title: draft.title.trim(),
      initialDate: draft.initialDate || dateKey(),
      professor: draft.professor.trim(),
      part: draft.part.trim(),
      notes: draft.notes.trim(),
      color: selectedPreset.color,
      textColor: selectedPreset.textColor,
      subjectId: createdSubjectId ?? (draft.subjectId || null),
      methodId: draft.methodId || null,
      excludedWeekdays: draft.excludedWeekdays,
      createdAt: draft.createdAt || now,
      updatedAt: now,
    })
    setDraft(null)
    setDraftStep(0)
  }

  const toggleExcludedDay = (day: RevisionWeekday) => {
    if (!draft) {
      return
    }

    setDraft({
      ...draft,
      excludedWeekdays: draft.excludedWeekdays.includes(day)
        ? draft.excludedWeekdays.filter((item) => item !== day)
        : [...draft.excludedWeekdays, day],
    })
  }

  const renderEventContent = (info: EventContentArg) => {
    const event = info.event.extendedProps.event as RevisionEvent
    const course = info.event.extendedProps.course as RevisionCourse | undefined
    const progress = info.event.extendedProps.progress as string
    const status = info.event.extendedProps.status as string

    return (
      <div className={`revision-fc-event status-${status}`}>
        <strong><i className="revision-course-dot" style={{ background: course?.color }} aria-hidden="true" />{info.event.title}</strong>
        {course?.part ? <small>{course.part}</small> : null}
        <span>
          {eventLabel(copy, course, event)} - {progress}
        </span>
      </div>
    )
  }

  const hasEventPanel = Boolean(selectedEvent && selectedCourse)

  return (
    <section
      className={`revision-planner-page${hasEventPanel ? ' has-event-panel' : ''}`}
      aria-label={copy.plannerTitle}
    >
      <div className="revision-planner-shell">
        <header className="revision-planner-header">
          <div>
            <h2>{copy.plannerTitle}</h2>
            <p>{copy.plannerSubtitle}</p>
          </div>
          <div className="revision-planner-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'today'}
              className={tab === 'today' ? 'is-selected' : ''}
              onClick={() => setTab('today')}
            >
              {copy.todayTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'calendar'}
              className={tab === 'calendar' ? 'is-selected' : ''}
              onClick={() => setTab('calendar')}
            >
              {copy.calendarTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'courses'}
              className={tab === 'courses' ? 'is-selected' : ''}
              onClick={() => setTab('courses')}
            >
              {copy.coursesTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'methods'}
              className={tab === 'methods' ? 'is-selected' : ''}
              onClick={() => setTab('methods')}
            >
              {copy.methodsTab}
            </button>
          </div>
          <button
            className="icon-button close-button"
            type="button"
            aria-label={copy.plannerClose}
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        </header>

        {tab === 'today' ? (
          <div className="revision-planner-today-view" role="tabpanel">
            <div className="revision-stats-grid is-planner">
              <div className="revision-stat">
                <CalendarDays size={17} strokeWidth={1.8} />
                <span>{copy.dueToday}</span>
                <strong>{dueToday.length}</strong>
              </div>
              <div className="revision-stat is-done">
                <CheckCircle2 size={17} strokeWidth={1.8} />
                <span>{copy.doneToday}</span>
                <strong>{doneToday.length}</strong>
              </div>
              <div className="revision-stat is-week">
                <RefreshCcw size={17} strokeWidth={1.8} />
                <span>{copy.thisWeek}</span>
                <strong>{doneWeek.length}</strong>
              </div>
            </div>

            <div className="revision-planner-today-head">
              <div>
                <span>{copy.todayTab}</span>
                <strong>{copy.todayQuestion}</strong>
              </div>
              <button
                className="gold-action"
                type="button"
                data-guide="revision-course-open"
                onClick={() => openNewCourse()}
              >
                <Plus size={15} strokeWidth={2} />
                {copy.addCourse}
              </button>
            </div>
            <label className="todo-sort-select revision-subject-filter">
              <select
                aria-label={copy.subjectFilter}
                value={todaySubjectFilter}
                onChange={(event) => setTodaySubjectFilter(event.target.value)}
              >
                <option value="">{copy.allSubjects}</option>
                <option value="none">{copy.noSubject}</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>

            <div className="revision-planner-today-list">
              {visibleDueToday.map((event) => {
                const course = coursesById.get(event.courseId)
                const subject = course?.subjectId ? subjectsById.get(course.subjectId) : undefined
                const status = revisionEventStatusForDay(event, today)
                const progress = Math.min(
                  event.completedPomodoros / Math.max(event.requiredPomodoros, 1),
                  1,
                )

                return (
                  <article
                    className={`revision-card status-${status}`}
                    key={event.id}
                    style={{
                      '--revision-color': subject?.color ?? course?.color,
                      '--revision-text-color': subject?.textColor ?? course?.textColor,
                    } as CSSProperties}
                  >
                    <div className="revision-card-main">
                      <span className="revision-kind">
                        {eventLabel(copy, course, event)}
                      </span>
                      <div className="revision-title-line">
                        <i className="revision-course-dot" style={{ background: course?.color }} aria-hidden="true" />
                        <strong>{course?.title ?? copy.courseName}</strong>
                      </div>
                      {course?.part ? (
                        <small>{copy.coursePartVisible(course.part)}</small>
                      ) : null}
                      <small>
                        {formatShortDate(event.scheduledDate, language)}
                        {event.scheduledTime ? ` ${event.scheduledTime}` : ''} -{' '}
                        {copy.statuses[status]}
                      </small>
                    </div>
                    <div className="revision-progress-line" aria-label={copy.progress}>
                      <span style={{ width: `${Math.round(progress * 100)}%` }} />
                      <strong>
                        {event.completedPomodoros}/{event.requiredPomodoros}
                      </strong>
                    </div>
                    <div className="revision-card-actions">
                      <button
                        className="gold-action small"
                        type="button"
                        onClick={() => onStartEvent(event.id)}
                      >
                        <Play size={13} strokeWidth={2} />
                        {event.status === 'active' ? copy.resume : copy.revise}
                      </button>
                      <button
                        className="ghost-action small"
                        type="button"
                        onClick={() => onMarkDone(event.id)}
                      >
                        <CheckCircle2 size={13} strokeWidth={1.9} />
                        {copy.markDone}
                      </button>
                      <button
                        className="ghost-action small"
                        type="button"
                        data-guide-course-delete={course?.id}
                        onClick={() => {
                          if (
                            course &&
                            globalThis.confirm(copy.deleteCourseConfirm(course.title))
                          ) {
                            onDeleteCourse(course.id)
                          }
                        }}
                      >
                        <Trash2 size={13} strokeWidth={1.9} />
                        {copy.deleteCourse}
                      </button>
                    </div>
                  </article>
                )
              })}

              {!visibleDueToday.length ? (
                <div className="revision-empty is-actionable">
                  <Sparkles size={20} strokeWidth={1.8} />
                  <strong>
                    {todayEvents.length ? copy.todayComplete : copy.todayEmpty}
                  </strong>
                  <span>{copy.todayPlannerHint}</span>
                  <div className="empty-action-row">
                    <button
                      className="gold-action small"
                      type="button"
                      data-guide="revision-course-open"
                      onClick={() => openNewCourse()}
                    >
                      <Plus size={13} strokeWidth={2} />
                      {copy.addFirstCourse}
                    </button>
                    <button
                      className="ghost-action small"
                      type="button"
                      onClick={() => setTab('methods')}
                    >
                      <RefreshCcw size={13} strokeWidth={1.9} />
                      {copy.chooseMethod}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === 'courses' ? (
          <div className="revision-planner-courses-view" role="tabpanel">
            <div className="revision-planner-today-head">
              <div>
                <span>{copy.coursesTab}</span>
                <strong>{copy.plannerSubtitle}</strong>
              </div>
              <button
                className="gold-action"
                type="button"
                data-guide="revision-course-open"
                onClick={() => openNewCourse()}
              >
                <Plus size={15} strokeWidth={2} />
                {copy.addCourse}
              </button>
            </div>

            <div className="revision-subject-management" aria-label={copy.subjects}>
              <div className="revision-subject-management-head">
                <strong>{copy.subjects}</strong>
                <label className="todo-sort-select revision-subject-filter">
                  <select
                    aria-label={copy.subjectFilter}
                    value={courseSubjectFilter}
                    onChange={(event) => setCourseSubjectFilter(event.target.value)}
                  >
                    <option value="">{copy.allSubjects}</option>
                    <option value="none">{copy.noSubject}</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              {subjects.length ? (
                <div className="revision-subject-list">
                  {subjects.map((subject) => (
                    <div key={subject.id} className="revision-subject-row" style={{ '--subject-color': subject.color } as CSSProperties}>
                      <i aria-hidden="true" />
                      <input
                        aria-label={copy.editSubject(subject.name)}
                        defaultValue={subject.name}
                        onBlur={(event) => {
                          const name = event.target.value.trim()
                          if (name && name !== subject.name) {
                            onSaveSubject({ ...subject, name, updatedAt: Date.now() })
                          }
                        }}
                      />
                      <select
                        aria-label={copy.subjectColor}
                        value={
                          REVISION_COLOR_PRESETS.find((preset) => preset.color === subject.color)?.id ??
                          REVISION_COLOR_PRESETS[0].id
                        }
                        onChange={(event) => {
                          const preset = REVISION_COLOR_PRESETS.find((item) => item.id === event.target.value)
                          if (preset) {
                            onSaveSubject({ ...subject, color: preset.color, textColor: preset.textColor, updatedAt: Date.now() })
                          }
                        }}
                      >
                        {REVISION_COLOR_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                      </select>
                      <button
                        className="icon-button close-button"
                        type="button"
                        aria-label={copy.deleteSubject(subject.name)}
                        onClick={() => {
                          if (globalThis.confirm(copy.deleteSubjectConfirm(subject.name))) {
                            onDeleteSubject(subject.id)
                          }
                        }}
                      >
                        <Trash2 size={14} strokeWidth={1.9} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : <small className="revision-subject-empty">{copy.subjectsEmpty}</small>}
            </div>

            {sortedCourses.length ? (
              <div className="revision-course-list">
                {sortedCourses.map((course) => {
                  const courseEvents = courseEventsById.get(course.id) ?? []

                  return (
                    <article
                      className="revision-course-management-card"
                      key={course.id}
                      style={{
                        '--revision-color': subjectsById.get(course.subjectId ?? '')?.color ?? course.color,
                        '--course-color': course.color,
                      } as CSSProperties}
                    >
                      <span className="revision-course-management-accent" aria-hidden="true" />
                      <div className="revision-course-management-copy">
                        <strong><i className="revision-course-dot" aria-hidden="true" />{course.title}</strong>
                        <small>
                          {subjectsById.get(course.subjectId ?? '')?.name ?? copy.noSubject} -{' '}
                          {formatShortDate(course.initialDate, language)}
                          {course.part ? ` - ${course.part}` : ''}
                          {course.professor ? ` - ${course.professor}` : ''}
                        </small>
                        <span>{copy.courseReminders(courseEvents.length)}</span>
                      </div>
                      <div className="revision-course-management-actions">
                        <button
                          className="ghost-action small"
                          type="button"
                          onClick={() => openEditCourse(course)}
                        >
                          <Edit3 size={13} strokeWidth={1.9} />
                          {copy.edit}
                        </button>
                        <button
                          className="ghost-action small is-danger"
                          type="button"
                          data-guide-course-delete={course.id}
                          onClick={() => {
                            if (globalThis.confirm(copy.deleteCourseConfirm(course.title))) {
                              onDeleteCourse(course.id)
                            }
                          }}
                        >
                          <Trash2 size={13} strokeWidth={1.9} />
                          {copy.deleteCourse}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="revision-empty is-actionable">
                <BookOpen size={20} strokeWidth={1.8} />
                <strong>{copy.coursesEmpty}</strong>
                <button
                  className="gold-action small"
                  type="button"
                  data-guide="revision-course-open"
                  onClick={() => openNewCourse()}
                >
                  <Plus size={13} strokeWidth={2} />
                  {copy.addFirstCourse}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {tab === 'calendar' ? (
          <div className="revision-planner-calendar-view" role="tabpanel">
            <div className="revision-planner-toolbar">
              <div className="revision-view-switcher">
                {CALENDAR_VIEWS.map((view) => (
                  <button
                    key={view}
                    type="button"
                    aria-pressed={plannerView === view}
                    className={plannerView === view ? 'is-selected' : ''}
                    onClick={() => changeView(view)}
                  >
                    {viewLabel(copy, view)}
                  </button>
                ))}
              </div>
              <div
                className={`revision-google-calendar${googleCalendar.lastError || !googleCalendarConfigured ? ' is-error' : ''}${googleCalendarSessionConnected ? ' is-connected' : ''}`}
              >
                <span>{copy.googleCalendar}</span>
                <strong>{googleCalendarStatus}</strong>
                {!googleCalendarConfigured ? (
                  <small>{copy.googleCalendarChecklist}</small>
                ) : googleCalendarSummary ? (
                  <small>{googleCalendarSummary}</small>
                ) : null}
                <button
                  className="ghost-action small"
                  type="button"
                  disabled={!googleCalendarConfigured}
                  onClick={onConnectGoogleCalendar}
                >
                  <CalendarDays size={13} strokeWidth={1.9} />
                  {googleCalendarSessionConnected
                    ? copy.googleCalendarConnected
                    : googleCalendar.enabled
                      ? copy.googleCalendarReconnect
                      : copy.googleCalendarConnect}
                </button>
                <button
                  className="ghost-action small"
                  type="button"
                  disabled={!googleCalendarConfigured}
                  onClick={onSyncGoogleCalendar}
                >
                  <RefreshCcw size={13} strokeWidth={1.9} />
                  {copy.googleCalendarSync}
                </button>
              </div>
              <button
                className="gold-action"
                type="button"
                data-guide="revision-course-open"
                onClick={() => openNewCourse()}
              >
                <Plus size={15} strokeWidth={2} />
                {copy.addCourse}
              </button>
            </div>

            {!calendarEvents.length ? (
              <div className="revision-calendar-onboarding">
                <div>
                  <Sparkles size={18} strokeWidth={1.8} />
                  <strong>{copy.calendarEmptyTitle}</strong>
                  <span>{copy.calendarEmptyHint}</span>
                </div>
                <div className="revision-ghost-cards" aria-hidden="true">
                  <span>{copy.initial}</span>
                  <span>{copy.exampleJ3}</span>
                  <span>{copy.exampleJ7}</span>
                </div>
                <button
                  className="gold-action small"
                  type="button"
                  data-guide="revision-course-open"
                  onClick={() => openNewCourse()}
                >
                  <Plus size={13} strokeWidth={2} />
                  {copy.addCourse}
                </button>
              </div>
            ) : null}

            <div className="revision-fullcalendar-shell">
              <FullCalendar
                ref={calendarRef}
                plugins={[
                  dayGridPlugin,
                  timeGridPlugin,
                  listPlugin,
                  interactionPlugin,
                ]}
                initialView={plannerView}
                initialDate={initialDate}
                firstDay={1}
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: '',
                }}
                buttonText={{
                  today: copy.today,
                  month: copy.viewMonth,
                  week: copy.viewWeek,
                  day: copy.viewDay,
                  list: copy.viewList,
                }}
                height="100%"
                locale={language}
                eventDisplay="block"
                editable
                eventStartEditable
                eventDurationEditable={false}
                allDayMaintainDuration={false}
                allDaySlot
                snapDuration="00:15:00"
                slotDuration="00:30:00"
                slotMinTime="05:00:00"
                slotMaxTime="23:00:00"
                eventTimeFormat={{
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }}
                events={calendarEvents}
                dateClick={handleDateClick}
                eventClick={handleEventClick}
                eventDrop={handleEventDrop}
                datesSet={handleDatesSet}
                eventContent={renderEventContent}
              />
            </div>
          </div>
        ) : null}

        {tab === 'methods' ? (
          <div className="revision-methods-view" role="tabpanel">
            <RevisionMethodsWidget
              copy={copy}
              methods={methods}
              onSaveMethod={onSaveMethod}
              onDeleteMethod={onDeleteMethod}
            />
          </div>
        ) : null}
      </div>

      {selectedEvent && selectedCourse ? (
        <aside className="revision-event-panel" aria-label={copy.eventDetails}>
          <div className="revision-event-panel-header">
            <div>
              <span>{eventLabel(copy, selectedCourse ?? undefined, selectedEvent)}</span>
              <strong>{selectedCourse.title}</strong>
              {selectedCourse.part ? (
                <small>{copy.coursePartVisible(selectedCourse.part)}</small>
              ) : null}
            </div>
            <button
              className="quiet-icon"
              type="button"
              aria-label={copy.closeModal}
              onClick={() => setSelectedEventId(null)}
            >
              <X size={14} strokeWidth={1.9} />
            </button>
          </div>

          <div
            className="revision-event-color-strip"
            style={{
              '--revision-color': selectedCourse.color,
              '--revision-text-color': selectedCourse.textColor,
            } as CSSProperties}
          >
            <span>{formatShortDate(selectedEvent.scheduledDate, language)}</span>
            <strong>
              {selectedEvent.scheduledTime ?? copy.allDay}
            </strong>
          </div>

          <div className="revision-event-time-line">
            <span>{copy.time}</span>
            <strong>
              {selectedEvent.scheduledTime
                ? `${formatShortDate(selectedEvent.scheduledDate, language)} ${selectedEvent.scheduledTime}`
                : `${formatShortDate(selectedEvent.scheduledDate, language)} - ${copy.allDay}`}
            </strong>
            <em>{copy.statuses[revisionEventStatusForDay(selectedEvent)]}</em>
          </div>

          <div className="revision-event-task-controls">
            <label>
              <span>{todoCopy.priority}</span>
              <select
                value={selectedEvent.priority}
                onChange={(event) =>
                  onUpdateEvent(selectedEvent.id, {
                    priority: event.target.value as TodoPriority,
                  })
                }
              >
                {TODO_PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {todoCopy.priorities[item]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{todoCopy.difficulty}</span>
              <select
                value={selectedEvent.difficulty}
                onChange={(event) =>
                  onUpdateEvent(selectedEvent.id, {
                    difficulty: event.target.value as TodoDifficulty,
                  })
                }
              >
                {TODO_DIFFICULTIES.map((item) => (
                  <option key={item} value={item}>
                    {todoCopy.difficulties[item]}
                  </option>
                ))}
              </select>
            </label>
            <div className="revision-event-goal">
              <span>{copy.objective}</span>
              <div className="goal-stepper small">
                <button
                  type="button"
                  aria-label={todoCopy.decreaseRequired}
                  onClick={() =>
                    onUpdateEvent(selectedEvent.id, {
                      requiredPomodoros: clampPomodoros(
                        selectedEvent.requiredPomodoros - 1,
                      ),
                    })
                  }
                >
                  <Minus size={13} strokeWidth={1.9} />
                </button>
                <strong>{selectedEvent.requiredPomodoros}</strong>
                <button
                  type="button"
                  aria-label={todoCopy.increaseRequired}
                  onClick={() =>
                    onUpdateEvent(selectedEvent.id, {
                      requiredPomodoros: clampPomodoros(
                        selectedEvent.requiredPomodoros + 1,
                      ),
                    })
                  }
                >
                  <Plus size={13} strokeWidth={1.9} />
                </button>
              </div>
            </div>
          </div>

          <div className="revision-progress-line is-panel" aria-label={copy.progress}>
            <span
              style={{
                width: `${Math.round(
                  (selectedEvent.completedPomodoros /
                    Math.max(selectedEvent.requiredPomodoros, 1)) *
                    100,
                )}%`,
              }}
            />
            <strong>
              {selectedEvent.completedPomodoros}/{selectedEvent.requiredPomodoros}
            </strong>
          </div>

          {selectedCourse.notes ? (
            <p className="revision-event-notes">{selectedCourse.notes}</p>
          ) : null}

          <div className="revision-event-actions-large">
            <button
              className="gold-action"
              type="button"
              onClick={() => onStartEvent(selectedEvent.id)}
            >
              <Play size={15} strokeWidth={2} />
              {copy.revise}
            </button>
            <button
              className="ghost-action"
              type="button"
              onClick={() => onMarkDone(selectedEvent.id)}
            >
              <CheckCircle2 size={15} strokeWidth={1.9} />
              {copy.markDone}
            </button>
            <button
              className="ghost-action"
              type="button"
              onClick={() => openEditCourse(selectedCourse)}
            >
              <Edit3 size={15} strokeWidth={1.9} />
              {copy.edit}
            </button>
            <button
              className="ghost-action"
              type="button"
              onClick={() => {
                onDeleteEvent(selectedEvent.id)
                setSelectedEventId(null)
              }}
            >
              <Trash2 size={15} strokeWidth={1.9} />
              {copy.deleteOccurrence}
            </button>
            <button
              className="ghost-action"
              type="button"
              onClick={() => {
                if (globalThis.confirm(copy.deleteCourseConfirm(selectedCourse.title))) {
                  onDeleteCourse(selectedCourse.id)
                  setSelectedEventId(null)
                }
              }}
            >
              <Trash2 size={15} strokeWidth={1.9} />
              {copy.deleteCourse}
            </button>
          </div>
        </aside>
      ) : null}

      {draft ? (
        <div className="revision-modal-backdrop is-page" role="presentation">
          <form className="revision-modal" onSubmit={submitCourse}>
            <div className="revision-modal-header">
              <div>
                <CalendarDays size={18} strokeWidth={1.8} />
                <h3>{draft.id ? copy.editCourseTitle : copy.addCourseTitle}</h3>
              </div>
              <button
                className="icon-button close-button"
                type="button"
                aria-label={copy.closeModal}
                onClick={() => {
                  setDraft(null)
                  setDraftStep(0)
                }}
              >
                <X size={15} strokeWidth={1.9} />
              </button>
            </div>

            <div className="revision-wizard-steps" aria-label={copy.creationSteps}>
              {draftStepLabels.map((label, index) => (
                <span
                  key={label}
                  className={[
                    index === draftStep ? 'is-current' : '',
                    index < draftStep ? 'is-complete' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <i>{index + 1}</i>
                  {label}
                </span>
              ))}
            </div>

            <div className="revision-modal-layout">
              <div className="revision-modal-main">
                {draftStep === 0 ? (
                  <div className="revision-form-grid">
                    <label>
                      <span>{copy.courseName}</span>
                      <input
                        data-guide="revision-course-title"
                        value={draft.title}
                        onChange={(event) =>
                          setDraft({ ...draft, title: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>{copy.initialDate}</span>
                      <input
                        type="date"
                        value={draft.initialDate}
                        onChange={(event) =>
                          setDraft({ ...draft, initialDate: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>{copy.subject}</span>
                      <select
                        value={draft.subjectId}
                        onChange={(event) =>
                          setDraft({ ...draft, subjectId: event.target.value })
                        }
                      >
                        <option value="">{copy.noSubject}</option>
                        {subjects.map((subject) => (
                          <option key={subject.id} value={subject.id}>
                            {subject.name}
                          </option>
                        ))}
                        <option value="new">{copy.newSubject}</option>
                      </select>
                    </label>
                    {draft.subjectId === 'new' ? (
                      <>
                        <label>
                          <span>{copy.subjectName}</span>
                          <input
                            value={draft.subjectName}
                            onChange={(event) =>
                              setDraft({ ...draft, subjectName: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          <span>{copy.subjectColor}</span>
                          <select
                            value={draft.subjectColorPresetId}
                            onChange={(event) =>
                              setDraft({ ...draft, subjectColorPresetId: event.target.value })
                            }
                          >
                            {REVISION_COLOR_PRESETS.map((preset) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : null}
                    <label>
                      <span>{copy.method}</span>
                      <select
                        value={draft.methodId}
                        onChange={(event) =>
                          setDraft({ ...draft, methodId: event.target.value })
                        }
                      >
                        <option value="">{copy.noMethod}</option>
                        {methods.map((method) => (
                          <option key={method.id} value={method.id}>
                            {method.name} - {methodLabel(method)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{copy.color}</span>
                      <select
                        value={draft.colorPresetId}
                        onChange={(event) =>
                          setDraft({ ...draft, colorPresetId: event.target.value })
                        }
                      >
                        {REVISION_COLOR_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                {draftStep === 1 ? (
                  <>
                    <div className="revision-form-grid">
                      <label>
                        <span>{copy.professor}</span>
                        <input
                          value={draft.professor}
                          onChange={(event) =>
                            setDraft({ ...draft, professor: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        <span>{copy.part}</span>
                        <input
                          value={draft.part}
                          onChange={(event) =>
                            setDraft({ ...draft, part: event.target.value })
                          }
                        />
                      </label>
                      <label className="revision-notes-field">
                        <span>{copy.notes}</span>
                        <textarea
                          value={draft.notes}
                          onChange={(event) =>
                            setDraft({ ...draft, notes: event.target.value })
                          }
                        />
                      </label>
                    </div>

                    <div className="revision-weekday-picker" aria-label={copy.excludedDays}>
                      <span>{copy.excludedDays}</span>
                      <div>
                        {REVISION_WEEKDAYS.map((day, index) => (
                          <button
                            key={day}
                            type="button"
                            className={
                              draft.excludedWeekdays.includes(day)
                                ? 'is-selected'
                                : ''
                            }
                            onClick={() => toggleExcludedDay(day)}
                          >
                            {copy.weekdays[index]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {draftStep === 2 ? (
                  <div className="revision-review-card">
                    <span>{copy.stepReview}</span>
                    <strong>{draft.title || copy.courseName}</strong>
                    <small>
                      {formatShortDate(draft.initialDate, language)} -{' '}
                      {selectedMethod
                        ? `${selectedMethod.name} (${methodLabel(selectedMethod)})`
                        : copy.noMethod}
                    </small>
                    <small>
                      {draft.professor || draft.part
                        ? [draft.professor, draft.part].filter(Boolean).join(' - ')
                        : copy.optionalDetailsEmpty}
                    </small>
                  </div>
                ) : null}
              </div>

              <aside className="revision-preview is-sticky">
                <span>{copy.methodSummary}</span>
                <div>
                  {previewEvents.map((event) => (
                    <em key={event.id}>
                      {eventLabel(copy, previewCourse ?? undefined, event)} -{' '}
                      {formatShortDate(event.scheduledDate, language)}
                    </em>
                  ))}
                </div>
              </aside>
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="revision-modal-actions">
              {draftStep > 0 ? (
                <button
                  className="ghost-action"
                  type="button"
                  onClick={() =>
                    setDraftStep((current) =>
                      Math.max(current - 1, 0) as CourseDraftStep,
                    )
                  }
                >
                  {copy.previousStep}
                </button>
              ) : null}
              {draft.id ? (
                <button
                  className="ghost-action"
                  type="button"
                  onClick={() => {
                    const course = coursesById.get(draft.id)

                    if (
                      course &&
                      globalThis.confirm(copy.deleteCourseConfirm(course.title))
                    ) {
                      onDeleteCourse(course.id)
                      setDraft(null)
                      setDraftStep(0)
                    }
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.9} />
                  {copy.deleteCourse}
                </button>
              ) : null}
              <button
                className="gold-action"
                type="submit"
                data-guide={
                  draftStep === 0
                    ? 'revision-course-continue-basics'
                    : draftStep === 1
                      ? 'revision-course-continue-details'
                      : 'revision-course-create'
                }
              >
                <Plus size={15} strokeWidth={2} />
                {draftStep < 2
                  ? copy.nextStep
                  : draft.id
                    ? copy.saveCourse
                    : copy.createCourse}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  )
}
