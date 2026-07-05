import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Flame,
  Image,
  Layers,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Sparkles,
  Star,
  Timer,
  Trophy,
  Users,
  Video,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { ElementType } from 'react'
import type { AppLanguage } from '../../types/app'

type GuideIcon =
  | 'bar'
  | 'bell'
  | 'book'
  | 'calendar'
  | 'check'
  | 'flame'
  | 'image'
  | 'layers'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'settings'
  | 'sparkles'
  | 'star'
  | 'task'
  | 'timer'
  | 'trophy'
  | 'users'
  | 'video'

type GuideStep = {
  title: string
  body: string
}

type GuideCard = {
  icon: GuideIcon
  title: string
  body: string
  meta?: string
}

type GuideSection = {
  id: string
  tab: string
  eyebrow: string
  title: string
  intro: string
  steps?: GuideStep[]
  cards?: GuideCard[]
  notes?: string[]
}

type GuideContent = {
  title: string
  subtitle: string
  close: string
  mapTitle: string
  route: string[]
  promiseTitle: string
  promise: GuideCard[]
  sections: GuideSection[]
}

const GUIDE_ICONS: Record<GuideIcon, ElementType> = {
  bar: BarChart3,
  bell: Bell,
  book: BookOpen,
  calendar: CalendarDays,
  check: CheckCircle2,
  flame: Flame,
  image: Image,
  layers: Layers,
  play: Play,
  plus: Plus,
  refresh: RefreshCcw,
  settings: Settings,
  sparkles: Sparkles,
  star: Star,
  task: CheckSquare,
  timer: Timer,
  trophy: Trophy,
  users: Users,
  video: Video,
}

const GUIDE_CONTENT: Record<AppLanguage, GuideContent> = {
  fr: {
    title: 'Guide de demarrage',
    subtitle:
      'Une visite pas a pas pour comprendre le dock, organiser tes cours, lancer tes sessions et suivre ta progression.',
    close: 'Fermer le guide',
    mapTitle: 'Parcours conseille',
    route: [
      'Commence par choisir une tache ou une revision du jour.',
      'Lance un Pomodoro, puis laisse les etoiles et la serie suivre ton effort.',
      'Planifie tes revisions en J pour revoir au bon moment.',
      'Ajoute YouTube, Quran, amis et fonds quand ton espace de travail est pret.',
    ],
    promiseTitle: 'Ce guide t apprend a',
    promise: [
      {
        icon: 'timer',
        title: 'Travailler maintenant',
        body: 'Lancer une session focus depuis une tache, une revision ou un Pomodoro libre.',
      },
      {
        icon: 'calendar',
        title: 'Reviser avec les J',
        body: 'Creer des rappels J+0, J+3, J+7 et ajouter tes propres jalons.',
      },
      {
        icon: 'video',
        title: 'Suivre une playlist',
        body: 'Coller une playlist YouTube et marquer chaque video comme vue.',
      },
    ],
    sections: [
      {
        id: 'start',
        tab: 'Demarrage',
        eyebrow: 'Premiere minute',
        title: 'Comprendre l ecran principal',
        intro:
          'Muslim Study Place fonctionne comme un bureau d etude. Le dock ouvre les outils, la barre du haut garde Quran et progression, et chaque panneau peut etre reduit quand tu veux plus d espace.',
        steps: [
          {
            title: 'Regarde le dock',
            body: 'A gauche sur ordinateur, en bas sur mobile. Chaque icone ouvre une vraie zone de travail : focus, taches, revisions, amis, YouTube ou fonds.',
          },
          {
            title: 'Choisis ton action du moment',
            body: 'Si tu as une tache active ou une revision due aujourd hui, commence par elle. Sinon lance Pomodoro libre pour entrer en concentration.',
          },
          {
            title: 'Reduis ce qui gene',
            body: 'Quand le Pomodoro est reduit, il reste en mini cercle pres du lecteur Quran. Tu peux rouvrir le minuteur d un clic.',
          },
        ],
        cards: [
          {
            icon: 'book',
            title: 'Guide',
            body: 'La page que tu lis. Elle explique les onglets et les routines sans toucher a tes donnees.',
          },
          {
            icon: 'settings',
            title: 'Parametres',
            body: 'Ouvre l engrenage pour changer langue, widgets, durees Pomodoro, fond, contraste et sauvegarde.',
          },
          {
            icon: 'play',
            title: 'Lecteur Quran',
            body: 'Le mini lecteur reste en haut. Tu peux changer recitateur, sourate, lecture et volume.',
          },
        ],
      },
      {
        id: 'dock',
        tab: 'Onglets',
        eyebrow: 'Tour du dock',
        title: 'Ce que fait chaque onglet',
        intro:
          'Chaque onglet a un role clair. Sur mobile, ouvrir un onglet remplace le precedent pour eviter les panneaux empiles.',
        cards: [
          {
            icon: 'calendar',
            title: 'Calendrier et methodes',
            meta: 'Onglet Revisions',
            body: 'Ouvre la page Revisions avec Aujourd hui, Calendrier et Methodes. C est la zone pour ajouter un cours, voir les J a venir et regler tes rappels.',
          },
          {
            icon: 'timer',
            title: 'Minuteur focus',
            body: 'Contient Pomodoro, pause courte, longue pause, objectif de suite, reset et Pomodoro libre.',
          },
          {
            icon: 'task',
            title: 'Taches',
            body: 'Affiche ton groupe principal de todo. Chaque tache peut avoir priorite, difficulte et nombre de pomodoros requis.',
          },
          {
            icon: 'plus',
            title: 'Ajouter une fenetre de taches',
            body: 'Cree un nouveau groupe de todo, par exemple Cours, Maison, Quran ou Examens. Chaque groupe peut avoir son emoji choisi dans la liste.',
          },
          {
            icon: 'bar',
            title: 'Tableau revisions',
            body: 'Vue rapide des revisions du jour. Les pastilles rouges indiquent combien de revisions sont dues aujourd hui.',
          },
          {
            icon: 'users',
            title: 'Amis',
            body: 'Codes amis, demandes recues, classement prive et detail de progression des personnes ajoutees.',
          },
          {
            icon: 'video',
            title: 'YouTube',
            body: 'Lecteur pour une video ou une playlist. Utile pour cours, recitations ou explications suivies.',
          },
          {
            icon: 'image',
            title: 'Fonds',
            body: 'Change le fond, ajoute une image ou une video locale et regle l ambiance visuelle.',
          },
        ],
      },
      {
        id: 'youtube',
        tab: 'YouTube',
        eyebrow: 'Cours et playlists',
        title: 'Mettre une playlist YouTube et suivre l avancement',
        intro:
          'Le lecteur YouTube sert a garder tes cours ou recitations dans ton espace d etude, sans perdre ou tu t es arrete.',
        steps: [
          {
            title: 'Ouvre l onglet YouTube',
            body: 'Colle une URL de video ou de playlist dans le champ YouTube URL, puis enregistre.',
          },
          {
            title: 'Utilise la liste de lecture',
            body: 'Si c est une playlist, l app affiche les videos disponibles, le sens de lecture, precedent/suivant et la video en cours.',
          },
          {
            title: 'Marque les videos comme vues',
            body: 'Clique sur l action Vue / A voir pour chaque item. Le compteur indique combien de videos sont deja vues.',
          },
          {
            title: 'Reprends facilement',
            body: 'La derniere video vue reste indiquee. Tu peux donc revenir plus tard et reprendre au bon endroit.',
          },
        ],
        notes: [
          'Si YouTube bloque une video integree, l app essaie de passer a l element disponible suivant.',
          'Pour un cours long, avance video par video et marque comme vue seulement quand tu as vraiment termine.',
        ],
      },
      {
        id: 'tasks',
        tab: 'Taches',
        eyebrow: 'Organisation',
        title: 'Faire plusieurs groupes de todo',
        intro:
          'Les groupes de taches evitent de melanger toutes tes obligations. Tu peux separer revisions, cours, memorisation, maison ou projets personnels.',
        steps: [
          {
            title: 'Cree un groupe',
            body: 'Clique sur le bouton + du dock. Une nouvelle fenetre de taches apparait avec son propre bouton dans le dock.',
          },
          {
            title: 'Renomme et choisis un emoji',
            body: 'Dans l en-tete de la fenetre, change le nom du groupe et choisis un emoji dans la liste proposee. L emoji remplace les lettres sur le dock.',
          },
          {
            title: 'Ajoute des taches mesurees',
            body: 'Chaque tache peut recevoir une priorite, une difficulte et un objectif de pomodoros. Une grande tache peut donc demander 3, 4 ou 6 sessions.',
          },
          {
            title: 'Lance le focus depuis une tache',
            body: 'Appuie sur Start/Reprendre sur une tache pour la mettre active et synchroniser le Pomodoro avec son objectif.',
          },
        ],
        cards: [
          {
            icon: 'bell',
            title: 'Pastille rouge',
            body: 'Sur le dock, un badge indique le nombre de taches ouvertes dans chaque groupe.',
          },
          {
            icon: 'check',
            title: 'Historique',
            body: 'Les taches terminees restent consultables, avec leurs reprises si tu refais le meme travail plus tard.',
          },
        ],
      },
      {
        id: 'pomodoro',
        tab: 'Pomodoro',
        eyebrow: 'Focus',
        title: 'Comment marche le Pomodoro',
        intro:
          'Un Pomodoro est une session de concentration. L app relie le minuteur aux taches et revisions pour que le temps travaille avec ton planning.',
        steps: [
          {
            title: 'Choisis le mode',
            body: 'Focus sert au travail. Pause et Longue pause servent a recuperer. Les durees se changent dans Parametres.',
          },
          {
            title: 'Regle l objectif',
            body: 'Le compteur 1, 2, 3... indique combien de pomodoros tu veux enchainer pour la tache ou la revision active.',
          },
          {
            title: 'Termine une session',
            body: 'A la fin d un focus, l app ajoute une etoile, avance la progression de la tache ou de la revision et met a jour la meilleure suite.',
          },
          {
            title: 'Reduis sans perdre le timer',
            body: 'Si tu fermes le panneau Pomodoro, un mini cercle reste a cote du lecteur Quran. Il montre le temps et permet play/pause.',
          },
        ],
        notes: [
          'Pomodoro libre sert quand tu veux travailler sans tache precise.',
          'Une tache ou revision active donne un contexte clair au minuteur et rend la progression plus lisible.',
        ],
      },
      {
        id: 'revisions',
        tab: 'Methode J',
        eyebrow: 'Revisions espacees',
        title: 'La methode des J : pourquoi et comment l utiliser',
        intro:
          'Les J sont des rappels a distance du cours. J+0 veut dire le jour du cours, J+3 trois jours apres, J+7 sept jours apres. C est utile parce que tu revises avant d oublier completement.',
        steps: [
          {
            title: 'Ajoute un cours',
            body: 'Ouvre Calendrier et methodes, puis Ajouter une revision. Etape 1 : nom, date du cours, methode et couleur. Etape 2 : professeur, partie, notes. Etape 3 : recap des dates.',
          },
          {
            title: 'Trouve les J du jour',
            body: 'Le Tableau revisions affiche les revisions dues aujourd hui. La page Revisions > Aujourd hui montre quoi reviser maintenant, avec Reviser, Reprendre et Marquer termine.',
          },
          {
            title: 'Comprends les onglets Revisions',
            body: 'Aujourd hui sert a agir. Calendrier sert a voir la semaine ou le mois. Methodes sert a choisir ou modifier les intervalles J+.',
          },
          {
            title: 'Ajoute un nouveau J',
            body: 'Va dans Methodes, clique Ajouter une methode ou modifie une methode personnelle, puis ajoute un rappel J+ avec le nombre de jours souhaite. Exemple : J+1, J+3, J+10, J+30.',
          },
        ],
        cards: [
          {
            icon: 'sparkles',
            title: 'Pourquoi c est efficace',
            body: 'Espacer les rappels force la memoire a reconstruire le cours plusieurs fois. C est plus solide que relire beaucoup une seule fois.',
          },
          {
            icon: 'calendar',
            title: 'Google Calendar',
            body: 'Si la configuration est ajoutee, les revisions peuvent aussi etre synchronisees vers Google Calendar.',
          },
          {
            icon: 'check',
            title: 'Revision terminee',
            body: 'Marquer termine recompense l effort et retire l occurrence des choses a faire du jour.',
          },
        ],
      },
      {
        id: 'progress',
        tab: 'Progression',
        eyebrow: 'Motivation',
        title: 'Etoiles, series de jours et flammes',
        intro:
          'La progression est la partie recompense. Elle doit t encourager, pas te distraire : regarde-la pour mesurer ta regularite, puis retourne au travail.',
        cards: [
          {
            icon: 'star',
            title: 'Etoiles',
            body: 'Chaque focus termine ajoute une etoile. Le badge Etoiles totales resume toute ton energie investie.',
          },
          {
            icon: 'trophy',
            title: 'Meilleure suite',
            body: 'La suite compte les pomodoros termines sans casser le rythme. Battre ton record declenche une mise en valeur.',
          },
          {
            icon: 'flame',
            title: 'Serie de jours',
            body: 'La flamme suit tes jours actifs. Si tu atteins ton objectif quotidien, le jour est allume dans la semaine.',
          },
          {
            icon: 'sparkles',
            title: 'Secrets de flamme',
            body: 'Certaines ascensions et effets se debloquent avec des exploits : semaine parfaite, 100 etoiles, longue suite, grosses taches terminees.',
          },
        ],
        steps: [
          {
            title: 'Lis les badges du haut',
            body: 'Serie de jours, meilleure suite et etoiles totales donnent une photo rapide de ta constance.',
          },
          {
            title: 'Ouvre un panneau de stats',
            body: 'Clique un badge pour voir le detail. L app n ouvre qu un panneau de stats a la fois pour garder l interface propre.',
          },
          {
            title: 'Equipe un effet',
            body: 'Dans la flamme, les effets debloques peuvent etre actives. Ils restent purement visuels et celebrent tes habitudes.',
          },
        ],
      },
      {
        id: 'rest',
        tab: 'Reste',
        eyebrow: 'Espace complet',
        title: 'Amis, fonds, sauvegarde et bonnes habitudes',
        intro:
          'Une fois les bases en place, tu peux rendre ton espace plus personnel et plus social sans perdre le centre : taches, revisions, focus.',
        cards: [
          {
            icon: 'users',
            title: 'Amis',
            body: 'Connecte-toi, copie ton code ami ou cherche un code. Les demandes recues apparaissent en badge rouge sur le dock.',
          },
          {
            icon: 'image',
            title: 'Fonds',
            body: 'Choisis un fond integre ou importe ton propre visuel. Regle l assombrissement si le texte devient moins lisible.',
          },
          {
            icon: 'settings',
            title: 'Compte et sauvegarde',
            body: 'Le compte cloud peut synchroniser tes donnees. En cas de conflit, compare Cloud et Ce PC avant de choisir.',
          },
          {
            icon: 'layers',
            title: 'Routine conseillee',
            body: 'Le matin : regarde Tableau revisions. Avant travail : choisis une tache. Pendant : Pomodoro. Apres : marque termine et passe au rappel suivant.',
          },
        ],
        notes: [
          'Garde peu de panneaux ouverts pendant une session de focus.',
          'Utilise les groupes de taches pour separer les contextes, pas pour tout multiplier inutilement.',
          'Reviens au guide quand tu ajoutes une nouvelle habitude au site.',
        ],
      },
    ],
  },
  en: {
    title: 'Starter guide',
    subtitle:
      'A step-by-step tour of the dock, focus sessions, revisions, tasks, playlists and progress system.',
    close: 'Close guide',
    mapTitle: 'Recommended path',
    route: [
      'Start from one task or one review due today.',
      'Run a Pomodoro and let stars and streaks track the effort.',
      'Plan spaced reviews with J+ reminders.',
      'Add YouTube, Quran, friends and backgrounds once the workspace feels clear.',
    ],
    promiseTitle: 'This guide teaches you to',
    promise: [
      {
        icon: 'timer',
        title: 'Work now',
        body: 'Start focus from a task, a review, or a free Pomodoro.',
      },
      {
        icon: 'calendar',
        title: 'Review with J+',
        body: 'Create J+0, J+3, J+7 reminders and add your own intervals.',
      },
      {
        icon: 'video',
        title: 'Track a playlist',
        body: 'Paste a YouTube playlist and mark each video as watched.',
      },
    ],
    sections: [
      {
        id: 'start',
        tab: 'Start',
        eyebrow: 'First minute',
        title: 'Understand the main screen',
        intro:
          'Muslim Study Place works like a study desk. The dock opens tools, the top bar keeps Quran and progress, and each panel can be minimized when you need space.',
        steps: [
          {
            title: 'Look at the dock',
            body: 'Left on desktop, bottom on mobile. Each icon opens a real workspace area: focus, tasks, reviews, friends, YouTube or backgrounds.',
          },
          {
            title: 'Pick the next action',
            body: 'If a task or review is active, start there. Otherwise use free Pomodoro to enter focus quickly.',
          },
          {
            title: 'Minimize distractions',
            body: 'When Pomodoro is minimized, a small circle remains near the Quran player so you can reopen or pause it.',
          },
        ],
      },
      {
        id: 'dock',
        tab: 'Tabs',
        eyebrow: 'Dock tour',
        title: 'What each tab does',
        intro:
          'Each tab has one clear purpose. On mobile, opening one tab replaces the previous one to avoid stacked panels.',
        cards: [
          {
            icon: 'calendar',
            title: 'Calendar and methods',
            body: 'The Revisions page: Today, Calendar and Methods.',
          },
          {
            icon: 'timer',
            title: 'Focus timer',
            body: 'Pomodoro, short break, long break, chain target and free Pomodoro.',
          },
          {
            icon: 'task',
            title: 'Tasks',
            body: 'Your main todo group, with priority, difficulty and required pomodoros.',
          },
          {
            icon: 'plus',
            title: 'Add task window',
            body: 'Create another todo group and choose its emoji from the fixed list.',
          },
          {
            icon: 'bar',
            title: 'Revision dashboard',
            body: 'A quick view of today reviews with red badges for due items.',
          },
          {
            icon: 'users',
            title: 'Friends',
            body: 'Friend codes, requests, private ranking and progress details.',
          },
          {
            icon: 'video',
            title: 'YouTube',
            body: 'A video or playlist player for lessons and recitations.',
          },
          {
            icon: 'image',
            title: 'Backgrounds',
            body: 'Change the visual mood and upload a local image or video.',
          },
        ],
      },
      {
        id: 'youtube',
        tab: 'YouTube',
        eyebrow: 'Lessons and playlists',
        title: 'Use a YouTube playlist and track progress',
        intro:
          'The YouTube player keeps lessons or recitations inside the study place and remembers where you stopped.',
        steps: [
          {
            title: 'Open YouTube',
            body: 'Paste a video or playlist URL, then save it.',
          },
          {
            title: 'Use the playlist',
            body: 'The app lists available videos, current video, previous and next controls.',
          },
          {
            title: 'Mark videos watched',
            body: 'Use Watched / To watch on each item. The counter shows watched progress.',
          },
          {
            title: 'Resume later',
            body: 'The last watched video remains visible, so you know where to continue.',
          },
        ],
      },
      {
        id: 'tasks',
        tab: 'Tasks',
        eyebrow: 'Organization',
        title: 'Create multiple todo groups',
        intro:
          'Task groups prevent every obligation from living in the same pile.',
        steps: [
          {
            title: 'Create a group',
            body: 'Click the + button in the dock.',
          },
          {
            title: 'Rename and choose an emoji',
            body: 'The emoji is chosen from the predefined list and appears on the dock.',
          },
          {
            title: 'Add measured tasks',
            body: 'Each task can define priority, difficulty and required Pomodoros.',
          },
          {
            title: 'Start focus from a task',
            body: 'Start/Resume makes it active and syncs the Pomodoro target.',
          },
        ],
      },
      {
        id: 'pomodoro',
        tab: 'Pomodoro',
        eyebrow: 'Focus',
        title: 'How Pomodoro works',
        intro:
          'A Pomodoro is a focus session linked to tasks and reviews.',
        steps: [
          {
            title: 'Choose the mode',
            body: 'Focus is for work. Break and long break are for recovery.',
          },
          {
            title: 'Set the target',
            body: 'The counter defines how many Pomodoros this task or review needs.',
          },
          {
            title: 'Complete a session',
            body: 'The app adds a star, advances progress and updates best run.',
          },
          {
            title: 'Minimize the timer',
            body: 'A mini circle remains next to the Quran player with time and play/pause.',
          },
        ],
      },
      {
        id: 'revisions',
        tab: 'J+ method',
        eyebrow: 'Spaced reviews',
        title: 'The J+ method: why and how',
        intro:
          'J+0 means course day, J+3 means three days later, J+7 seven days later. Spacing reviews helps you recall before forgetting fully.',
        steps: [
          {
            title: 'Add a course',
            body: 'Open Calendar and methods, then Add revision. Fill basics, optional details and recap.',
          },
          {
            title: 'Find today J+',
            body: 'Revision Dashboard and Revisions > Today show what is due now.',
          },
          {
            title: 'Use revision tabs',
            body: 'Today is for action, Calendar for planning, Methods for intervals.',
          },
          {
            title: 'Add a new J+',
            body: 'Open Methods, add or edit a personal method, then add a J+ reminder with the number of days.',
          },
        ],
      },
      {
        id: 'progress',
        tab: 'Progress',
        eyebrow: 'Motivation',
        title: 'Stars, streaks and flames',
        intro:
          'Progress rewards consistency without replacing the work itself.',
        cards: [
          {
            icon: 'star',
            title: 'Stars',
            body: 'Each completed focus adds one star.',
          },
          {
            icon: 'trophy',
            title: 'Best run',
            body: 'Tracks completed Pomodoros chained without breaking rhythm.',
          },
          {
            icon: 'flame',
            title: 'Day streak',
            body: 'Lights days when you hit the daily goal.',
          },
          {
            icon: 'sparkles',
            title: 'Flame secrets',
            body: 'Achievements unlock visual flame effects.',
          },
        ],
      },
      {
        id: 'rest',
        tab: 'More',
        eyebrow: 'Complete space',
        title: 'Friends, backgrounds, backup and habits',
        intro:
          'Once the basics are clear, personalize the place without losing the center: tasks, reviews, focus.',
        cards: [
          {
            icon: 'users',
            title: 'Friends',
            body: 'Use friend codes, requests and private ranking.',
          },
          {
            icon: 'image',
            title: 'Backgrounds',
            body: 'Choose or upload an image/video and adjust dimming.',
          },
          {
            icon: 'settings',
            title: 'Cloud account',
            body: 'Sync data and compare Cloud vs This PC if a conflict appears.',
          },
          {
            icon: 'layers',
            title: 'Recommended routine',
            body: 'Check reviews, pick one task, run Pomodoro, mark done, repeat.',
          },
        ],
      },
    ],
  },
}

type GuidePageProps = {
  language: AppLanguage
  onClose: () => void
}

export function GuidePage({ language, onClose }: GuidePageProps) {
  const copy = GUIDE_CONTENT[language]
  const [activeId, setActiveId] = useState(copy.sections[0].id)
  const activeSection =
    copy.sections.find((section) => section.id === activeId) ?? copy.sections[0]

  return (
    <section className="guide-page" aria-label={copy.title}>
      <div className="guide-page-shell">
        <header className="guide-page-header">
          <div className="guide-title-block">
            <span className="guide-page-emblem">
              <BookOpen size={23} strokeWidth={1.9} />
            </span>
            <div>
              <h2>{copy.title}</h2>
              <p>{copy.subtitle}</p>
            </div>
          </div>
          <button
            className="icon-button close-button"
            type="button"
            aria-label={copy.close}
            onClick={onClose}
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        </header>

        <div className="guide-hero">
          <div>
            <span>{copy.promiseTitle}</span>
            <strong>{activeSection.title}</strong>
            <p>{activeSection.intro}</p>
          </div>
          <div className="guide-promise-grid">
            {copy.promise.map((item) => {
              const Icon = GUIDE_ICONS[item.icon]

              return (
                <article key={item.title}>
                  <Icon size={17} strokeWidth={1.8} />
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </article>
              )
            })}
          </div>
        </div>

        <nav className="guide-tabs" role="tablist" aria-label={copy.title}>
          {copy.sections.map((section) => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={activeSection.id === section.id}
              className={activeSection.id === section.id ? 'is-selected' : ''}
              onClick={() => setActiveId(section.id)}
            >
              {section.tab}
            </button>
          ))}
        </nav>

        <div className="guide-content">
          <aside className="guide-route-card">
            <span>{copy.mapTitle}</span>
            <ol>
              {copy.route.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </aside>

          <main className="guide-section-panel" role="tabpanel">
            <div className="guide-section-heading">
              <span>{activeSection.eyebrow}</span>
              <h3>{activeSection.title}</h3>
              <p>{activeSection.intro}</p>
            </div>

            {activeSection.steps?.length ? (
              <ol className="guide-step-list">
                {activeSection.steps.map((step, index) => (
                  <li key={step.title}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}

            {activeSection.cards?.length ? (
              <div className="guide-card-grid">
                {activeSection.cards.map((card) => {
                  const Icon = GUIDE_ICONS[card.icon]

                  return (
                    <article key={`${activeSection.id}-${card.title}`}>
                      <span>
                        <Icon size={18} strokeWidth={1.8} />
                      </span>
                      <div>
                        {card.meta ? <small>{card.meta}</small> : null}
                        <strong>{card.title}</strong>
                        <p>{card.body}</p>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : null}

            {activeSection.notes?.length ? (
              <div className="guide-note-list">
                {activeSection.notes.map((note) => (
                  <p key={note}>
                    <Sparkles size={14} strokeWidth={1.8} />
                    {note}
                  </p>
                ))}
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </section>
  )
}
