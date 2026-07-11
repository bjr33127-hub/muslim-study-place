import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Compass,
  MousePointer2,
  Sparkles,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { AppLanguage } from '../../types/app'

export type GuideTourStep =
  | 'welcome'
  | 'pomodoro'
  | 'tasks'
  | 'revisions'
  | 'course-open'
  | 'course-name'
  | 'course-basics'
  | 'course-details'
  | 'course-create'
  | 'course-delete'
  | 'friends'
  | 'backgrounds'
  | 'background-select'
  | 'youtube'
  | 'youtube-url'
  | 'youtube-watched'
  | 'settings'
  | 'complete'

type StepCopy = {
  id: GuideTourStep
  eyebrow: string
  title: string
  body: string
  task?: string
  selector?: string
  event?: 'click' | 'submit' | 'input'
  action?: string
  requiresValue?: boolean
}

type GuideCopy = {
  label: string
  close: string
  skip: string
  previous: string
  next: string
  start: string
  finish: string
  taskLabel: string
  waiting: string
  completed: string
  steps: StepCopy[]
}

const GUIDE_COPY: Record<AppLanguage, GuideCopy> = {
  fr: {
    label: 'Visite guidee interactive',
    close: 'Fermer la visite guidee',
    skip: 'Passer cette etape',
    previous: 'Retour',
    next: 'Continuer',
    start: 'Commencer la visite',
    finish: 'Terminer et explorer',
    taskLabel: 'Mini-mission',
    waiting: 'Je prepare cette zone...',
    completed: 'Mission accomplie',
    steps: [
      {
        id: 'welcome',
        eyebrow: 'Bienvenue dans ton espace',
        title: 'On explore le site ensemble',
        body:
          'Cette visite se passe directement dans ton espace. Chaque etape eclaire un vrai outil et te propose une petite action pour apprendre en pratiquant.',
      },
      {
        id: 'pomodoro',
        eyebrow: '01 - Concentration',
        title: 'Teste le controle du focus',
        body:
          'Le Pomodoro rythme ton travail et alimente tes etoiles. Tu peux garder le chrono actif meme quand le widget est reduit.',
        task: 'Clique sur le controle principal du Pomodoro.',
        selector: '[data-guide="pomodoro-start"]',
        event: 'click',
      },
      {
        id: 'tasks',
        eyebrow: '02 - Organisation',
        title: 'Cree une petite tache',
        body:
          'Les fenetres de taches regroupent tes objectifs. Chaque tache peut avoir sa priorite, sa difficulte et son nombre de Pomodoros.',
        task: 'Ecris une tache courte puis valide-la avec le bouton +.',
        selector: '[data-guide="todo-add-form"]',
        event: 'submit',
      },
      {
        id: 'revisions',
        eyebrow: '03 - Revisions espacees',
        title: 'Ouvre ton calendrier de revisions',
        body:
          'Le planner transforme un cours en rappels progressifs et te permet de suivre chaque revision dans le temps.',
        task: 'Clique sur le calendrier dans le dock.',
        selector: '[data-guide="revisions-open"]',
        event: 'click',
      },
      {
        id: 'course-open',
        eyebrow: '04 - Premier cours',
        title: 'Ajoute un cours au calendrier',
        body:
          'Un cours cree automatiquement ses rappels selon la methode de revision choisie. Commence par ouvrir le formulaire.',
        task: 'Clique sur Ajouter un cours.',
        selector: '[data-guide="revision-planner"] [data-guide-target="revision-course-open"]',
        event: 'click',
      },
      {
        id: 'course-name',
        eyebrow: '05 - Planification active',
        title: 'Donne un nom a ton cours',
        body:
          'Le nom est la seule information obligatoire. Il apparaitra dans ton calendrier et dans tes rappels.',
        task: 'Ecris le nom de ton premier cours.',
        selector: '[data-guide="revision-course-title"]',
        event: 'input',
        requiresValue: true,
      },
      {
        id: 'course-basics',
        eyebrow: '06 - Planification active',
        title: 'Valide les informations de base',
        body:
          'La date, la methode et la couleur sont deja preselectionnees. Tu peux les adapter avant de continuer.',
        task: 'Clique sur Continuer.',
        selector: '[data-guide="revision-course-continue-basics"]',
        event: 'click',
      },
      {
        id: 'course-details',
        eyebrow: '07 - Details facultatifs',
        title: 'Passe aux rappels',
        body:
          'Professeur, chapitre et notes sont facultatifs. Ajoute-les si tu veux, puis passe a la verification.',
        task: 'Clique sur Continuer pour voir le recapitulatif.',
        selector: '[data-guide="revision-course-continue-details"]',
        event: 'click',
      },
      {
        id: 'course-create',
        eyebrow: '08 - Creation',
        title: 'Cree les rappels',
        body:
          'Le recapitulatif affiche les prochaines dates. La creation ajoute ton cours et ses revisions au planner.',
        task: 'Clique sur Creer le cours.',
        selector: '[data-guide="revision-course-create"]',
        action: 'revision-course-saved',
      },
      {
        id: 'course-delete',
        eyebrow: '09 - Garde le controle',
        title: 'Supprime le cours de test',
        body:
          'Tu peux retirer un cours et tous ses rappels quand tu le souhaites. La visite cible celui que tu viens de creer.',
        task: 'Clique sur Supprimer puis confirme.',
        selector: '[data-guide-course-delete]',
        action: 'revision-course-deleted',
      },
      {
        id: 'friends',
        eyebrow: '10 - Cercle prive',
        title: 'Decouvre le mode Amis',
        body:
          'Retrouve ton code ami, tes demandes et le classement prive. Les invitations arrivent automatiquement pendant que tu etudies.',
        task: 'Ouvre Amis depuis le dock.',
        selector: '[data-guide="friends-open"]',
        event: 'click',
      },
      {
        id: 'backgrounds',
        eyebrow: '11 - Ambiance',
        title: 'Choisis ton decor',
        body:
          'Les fonds changent l atmosphere sans toucher a tes donnees. Tu peux utiliser les decors proposes ou importer le tien.',
        task: 'Ouvre la galerie Fonds depuis le dock.',
        selector: '[data-guide="backgrounds-open"]',
        event: 'click',
      },
      {
        id: 'background-select',
        eyebrow: '12 - Decor vivant',
        title: 'Essaie un autre fond',
        body:
          'Chaque decor est applique immediatement. Cette mission est facultative : tu peux garder ton fond actuel si tu le preferes.',
        task: 'Si tu veux, clique sur un fond different.',
        selector: '[data-guide-background-choice]',
        action: 'background-selected',
      },
      {
        id: 'youtube',
        eyebrow: '13 - Playlist',
        title: 'Ouvre le lecteur YouTube',
        body:
          'Le lecteur accepte une playlist personnelle et garde ton avancement video par video.',
        task: 'Ouvre YouTube depuis le dock.',
        selector: '[data-guide="youtube-open"]',
        event: 'click',
      },
      {
        id: 'youtube-url',
        eyebrow: '14 - Ta propre selection',
        title: 'Change la playlist affichee',
        body:
          'Colle le lien d une autre playlist YouTube dans le champ puis sauvegarde-le. Tu peux aussi simplement tester avec le lien deja present.',
        task: 'Modifie ou valide le lien de playlist avec le bouton enregistrer.',
        selector: '[data-guide="youtube-url-form"]',
        action: 'youtube-url-saved',
      },
      {
        id: 'youtube-watched',
        eyebrow: '15 - Progression video',
        title: 'Marque une video comme vue',
        body:
          'Le bouton A voir devient Vue et la barre de progression de la playlist se met a jour instantanement.',
        task: 'Appuie sur A voir pour la premiere video.',
        selector: '[data-guide="youtube-mark-watched"]',
        action: 'youtube-watched-toggled',
      },
      {
        id: 'settings',
        eyebrow: '16 - Reglages',
        title: 'Personnalise ton espace',
        body:
          'Les parametres gerent la disposition, le contraste, les particules, les objectifs et la duree des sessions.',
        task: 'Clique sur la roue dentee en haut a gauche.',
        selector: '[data-guide="settings-open"]',
        event: 'click',
      },
      {
        id: 'complete',
        eyebrow: 'Visite terminee',
        title: 'Ton espace est pret',
        body:
          'Tu connais maintenant le parcours essentiel : planifier, te concentrer, reviser, avancer avec tes amis et adapter ton ambiance.',
      },
    ],
  },
  en: {
    label: 'Interactive guided tour',
    close: 'Close the guided tour',
    skip: 'Skip this step',
    previous: 'Back',
    next: 'Continue',
    start: 'Start the tour',
    finish: 'Finish and explore',
    taskLabel: 'Mini mission',
    waiting: 'Preparing this area...',
    completed: 'Mission complete',
    steps: [
      {
        id: 'welcome',
        eyebrow: 'Welcome to your space',
        title: 'Let us explore the site together',
        body:
          'This tour happens inside your actual workspace. Each step highlights a real tool and gives you one small action to learn by doing.',
      },
      {
        id: 'pomodoro',
        eyebrow: '01 - Focus',
        title: 'Try the focus control',
        body:
          'Pomodoro structures your work and earns stars. The timer keeps running even while its main widget is minimized.',
        task: 'Click the Pomodoro main control.',
        selector: '[data-guide="pomodoro-start"]',
        event: 'click',
      },
      {
        id: 'tasks',
        eyebrow: '02 - Planning',
        title: 'Create a small task',
        body:
          'Task windows group your goals. Every task can have a priority, difficulty, and Pomodoro target.',
        task: 'Write a short task and submit it with the + button.',
        selector: '[data-guide="todo-add-form"]',
        event: 'submit',
      },
      {
        id: 'revisions',
        eyebrow: '03 - Spaced review',
        title: 'Open your revision calendar',
        body:
          'The planner turns a course into progressive reminders and tracks each review over time.',
        task: 'Click the calendar in the dock.',
        selector: '[data-guide="revisions-open"]',
        event: 'click',
      },
      {
        id: 'course-open',
        eyebrow: '04 - First course',
        title: 'Add a course to the calendar',
        body:
          'A course automatically creates reminders from your chosen review method. Start by opening the form.',
        task: 'Click Add course.',
        selector: '[data-guide="revision-planner"] [data-guide-target="revision-course-open"]',
        event: 'click',
      },
      {
        id: 'course-name',
        eyebrow: '05 - Active planning',
        title: 'Name your course',
        body:
          'The name is the only required detail. It will appear in your calendar and reminders.',
        task: 'Type the name of your first course.',
        selector: '[data-guide="revision-course-title"]',
        event: 'input',
        requiresValue: true,
      },
      {
        id: 'course-basics',
        eyebrow: '06 - Active planning',
        title: 'Confirm the basics',
        body:
          'The date, method, and color are already selected. Adjust them if you want before continuing.',
        task: 'Click Continue.',
        selector: '[data-guide="revision-course-continue-basics"]',
        event: 'click',
      },
      {
        id: 'course-details',
        eyebrow: '07 - Optional details',
        title: 'Move on to reminders',
        body:
          'Teacher, chapter, and notes are optional. Add them if useful, then move to the summary.',
        task: 'Click Continue to see the summary.',
        selector: '[data-guide="revision-course-continue-details"]',
        event: 'click',
      },
      {
        id: 'course-create',
        eyebrow: '08 - Create',
        title: 'Create the reminders',
        body:
          'The summary shows the upcoming dates. Creating adds your course and reminders to the planner.',
        task: 'Click Create course.',
        selector: '[data-guide="revision-course-create"]',
        action: 'revision-course-saved',
      },
      {
        id: 'course-delete',
        eyebrow: '09 - Stay in control',
        title: 'Delete the test course',
        body:
          'You can remove a course and all its reminders at any time. The tour targets the one you just created.',
        task: 'Click Delete and confirm.',
        selector: '[data-guide-course-delete]',
        action: 'revision-course-deleted',
      },
      {
        id: 'friends',
        eyebrow: '10 - Private circle',
        title: 'Discover Friends mode',
        body:
          'Find your friend code, requests, and private leaderboard. Invitations refresh automatically while you study.',
        task: 'Open Friends from the dock.',
        selector: '[data-guide="friends-open"]',
        event: 'click',
      },
      {
        id: 'backgrounds',
        eyebrow: '11 - Atmosphere',
        title: 'Choose your scenery',
        body:
          'Backgrounds change the mood without touching your data. Use a built-in scene or import your own.',
        task: 'Open Backgrounds from the dock.',
        selector: '[data-guide="backgrounds-open"]',
        event: 'click',
      },
      {
        id: 'background-select',
        eyebrow: '12 - Living scenery',
        title: 'Try another background',
        body:
          'Every scene applies immediately. This mission is optional, so keep your current background if you prefer it.',
        task: 'If you want, click a different background.',
        selector: '[data-guide-background-choice]',
        action: 'background-selected',
      },
      {
        id: 'youtube',
        eyebrow: '13 - Playlist',
        title: 'Open the YouTube player',
        body:
          'The player accepts your own playlist and remembers progress video by video.',
        task: 'Open YouTube from the dock.',
        selector: '[data-guide="youtube-open"]',
        event: 'click',
      },
      {
        id: 'youtube-url',
        eyebrow: '14 - Your own selection',
        title: 'Change the displayed playlist',
        body:
          'Paste another YouTube playlist link and save it. You can also test the action with the current link.',
        task: 'Change or validate the playlist link with the save button.',
        selector: '[data-guide="youtube-url-form"]',
        action: 'youtube-url-saved',
      },
      {
        id: 'youtube-watched',
        eyebrow: '15 - Video progress',
        title: 'Mark one video as watched',
        body:
          'The To watch button becomes Watched and the playlist progress bar updates immediately.',
        task: 'Press To watch on the first video.',
        selector: '[data-guide="youtube-mark-watched"]',
        action: 'youtube-watched-toggled',
      },
      {
        id: 'settings',
        eyebrow: '16 - Settings',
        title: 'Personalize your space',
        body:
          'Settings control layout, contrast, particles, goals, and focus session durations.',
        task: 'Click the settings button at the top left.',
        selector: '[data-guide="settings-open"]',
        event: 'click',
      },
      {
        id: 'complete',
        eyebrow: 'Tour complete',
        title: 'Your space is ready',
        body:
          'You now know the essential flow: plan, focus, review, progress with friends, and shape your atmosphere.',
      },
    ],
  },
}

type TargetRect = {
  top: number
  left: number
  width: number
  height: number
}

type GuidePageProps = {
  language: AppLanguage
  onClose: () => void
  onPrepareStep?: (step: GuideTourStep) => void
}

function findTarget(selector?: string) {
  if (!selector) {
    return null
  }

  return document.querySelector<HTMLElement>(selector)
}

export function GuidePage({ language, onClose, onPrepareStep }: GuidePageProps) {
  const copy = GUIDE_COPY[language]
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
  const [missionComplete, setMissionComplete] = useState(false)
  const [createdCourseId, setCreatedCourseId] = useState('')
  const completionTimerRef = useRef<number>(0)
  const step = copy.steps[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === copy.steps.length - 1
  const progress = Math.round((stepIndex / (copy.steps.length - 1)) * 100)

  const targetSelector = useMemo(() => {
    if (step.id === 'course-delete' && createdCourseId) {
      return `[data-guide-course-delete="${createdCourseId}"]`
    }

    return step.selector
  }, [createdCourseId, step.id, step.selector])

  const measureTarget = useCallback((scrollIntoView = false) => {
    const target = findTarget(targetSelector)

    if (!target) {
      setTargetRect(null)
      return
    }

    if (scrollIntoView) {
      target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    }
    const rect = target.getBoundingClientRect()
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    })
  }, [targetSelector])

  useEffect(() => {
    onPrepareStep?.(step.id)
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => measureTarget(true))
      return () => window.cancelAnimationFrame(secondFrame)
    })
    const retry = window.setTimeout(() => measureTarget(true), 320)

    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.clearTimeout(retry)
    }
  }, [measureTarget, onPrepareStep, step.id])

  useEffect(() => {
    const update = () => measureTarget(false)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [measureTarget])

  useEffect(() => {
    if (!step.selector || !step.event) {
      return
    }

    const completeMission = (event: Event) => {
      const source = event.target

      if (!(source instanceof Element) || !source.closest(step.selector!)) {
        return
      }

      if (
        step.requiresValue &&
        (!(source instanceof HTMLInputElement) || !source.value.trim())
      ) {
        return
      }

      setMissionComplete(true)
      window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = window.setTimeout(() => {
        setMissionComplete(false)
        setStepIndex((current) =>
          current === stepIndex ? Math.min(current + 1, copy.steps.length - 1) : current,
        )
      }, 520)
    }

    document.addEventListener(step.event, completeMission, true)
    return () => {
      document.removeEventListener(step.event!, completeMission, true)
      window.clearTimeout(completionTimerRef.current)
    }
  }, [copy.steps.length, step.event, step.requiresValue, step.selector, stepIndex])

  useEffect(() => {
    if (!step.action) {
      return
    }

    const completeMission = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; id?: string }>).detail

      if (detail?.action !== step.action) {
        return
      }

      if (step.id === 'course-delete' && createdCourseId && detail.id !== createdCourseId) {
        return
      }

      if (step.id === 'course-create' && detail.id) {
        setCreatedCourseId(detail.id)
      }

      setMissionComplete(true)
      window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = window.setTimeout(() => {
        setMissionComplete(false)
        setStepIndex((current) =>
          current === stepIndex ? Math.min(current + 1, copy.steps.length - 1) : current,
        )
      }, 520)
    }

    window.addEventListener('msp:guide-action', completeMission)
    return () => window.removeEventListener('msp:guide-action', completeMission)
  }, [copy.steps.length, createdCourseId, step.action, step.id, stepIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const panelStyle = useMemo<CSSProperties>(() => {
    if (!targetRect) {
      return {}
    }

    const panelWidth = Math.min(410, window.innerWidth - 28)
    const panelHeight = Math.min(470, window.innerHeight - 28)
    const gap = 20
    const safe = 14
    const clampLeft = (left: number) => Math.min(
      Math.max(left, safe),
      window.innerWidth - panelWidth - safe,
    )
    const clampTop = (top: number) => Math.min(
      Math.max(top, safe),
      window.innerHeight - panelHeight - safe,
    )
    const centeredLeft = clampLeft(targetRect.left + targetRect.width / 2 - panelWidth / 2)
    const centeredTop = clampTop(targetRect.top + targetRect.height / 2 - panelHeight / 2)
    const candidates = [
      { left: targetRect.left + targetRect.width + gap, top: centeredTop },
      { left: targetRect.left - panelWidth - gap, top: centeredTop },
      { left: centeredLeft, top: targetRect.top + targetRect.height + gap },
      { left: centeredLeft, top: targetRect.top - panelHeight - gap },
    ]
    const overlapsTarget = ({ left, top }: { left: number; top: number }) =>
      left < targetRect.left + targetRect.width + 10 &&
      left + panelWidth > targetRect.left - 10 &&
      top < targetRect.top + targetRect.height + 10 &&
      top + panelHeight > targetRect.top - 10
    const fitsViewport = ({ left, top }: { left: number; top: number }) =>
      left >= safe &&
      top >= safe &&
      left + panelWidth <= window.innerWidth - safe &&
      top + panelHeight <= window.innerHeight - safe
    const chosen = candidates.find(
      (candidate) => fitsViewport(candidate) && !overlapsTarget(candidate),
    ) ?? {
      left: targetRect.left + targetRect.width / 2 < window.innerWidth / 2
        ? window.innerWidth - panelWidth - safe
        : safe,
      top: targetRect.top + targetRect.height / 2 < window.innerHeight / 2
        ? window.innerHeight - panelHeight - safe
        : safe,
    }

    return { top: clampTop(chosen.top), left: clampLeft(chosen.left), width: panelWidth }
  }, [targetRect])

  const spotlightStyle = targetRect
    ? ({
        top: Math.max(targetRect.top - 8, 6),
        left: Math.max(targetRect.left - 8, 6),
        width: Math.min(targetRect.width + 16, window.innerWidth - 12),
        height: Math.min(targetRect.height + 16, window.innerHeight - 12),
      } satisfies CSSProperties)
    : undefined

  const goNext = () => {
    if (isLast) {
      onClose()
      return
    }

    setMissionComplete(false)
    setStepIndex((current) => Math.min(current + 1, copy.steps.length - 1))
  }

  return (
    <section
      className={`guide-tour${targetRect ? ' has-target' : ''}`}
      aria-label={copy.label}
      aria-live="polite"
    >
      <div className="guide-tour-scrim" />
      {targetRect ? <div className="guide-tour-spotlight" style={spotlightStyle} /> : null}
      <article className="guide-tour-card" style={panelStyle}>
        <div className="guide-tour-progress" aria-label={`${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <header className="guide-tour-header">
          <span className="guide-tour-emblem">
            {isLast ? <CheckCircle2 size={22} /> : <Compass size={22} />}
          </span>
          <div>
            <small>{step.eyebrow}</small>
            <strong>
              {stepIndex + 1}/{copy.steps.length}
            </strong>
          </div>
          <button className="quiet-icon" type="button" aria-label={copy.close} onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="guide-tour-body">
          <h2>{step.title}</h2>
          <p>{step.body}</p>
          {step.task ? (
            <div className={`guide-tour-mission${missionComplete ? ' is-complete' : ''}`}>
              <span>{missionComplete ? <Check size={18} /> : <MousePointer2 size={18} />}</span>
              <div>
                <small>{missionComplete ? copy.completed : copy.taskLabel}</small>
                <strong>{missionComplete ? copy.completed : step.task}</strong>
              </div>
            </div>
          ) : (
            <div className="guide-tour-welcome-mark" aria-hidden="true">
              <Sparkles size={18} />
              <span />
              <span />
              <span />
            </div>
          )}
          {targetSelector && !targetRect ? (
            <span className="guide-tour-waiting">{copy.waiting}</span>
          ) : null}
        </div>

        <footer className="guide-tour-actions">
          <button
            className="ghost-action small"
            type="button"
            disabled={isFirst}
            onClick={() => {
              setMissionComplete(false)
              setStepIndex((current) => Math.max(0, current - 1))
            }}
          >
            <ArrowLeft size={14} />
            {copy.previous}
          </button>
          {step.task ? (
            <button className="guide-tour-skip" type="button" onClick={goNext}>
              {copy.skip}
            </button>
          ) : null}
          {!step.task ? (
            <button className="gold-action" type="button" onClick={goNext}>
              {isFirst ? copy.start : isLast ? copy.finish : copy.next}
              <ArrowRight size={15} />
            </button>
          ) : null}
        </footer>
      </article>
    </section>
  )
}
