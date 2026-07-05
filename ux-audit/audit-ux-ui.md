# Audit UX/UI - Muslim Study Place

Date: 2026-07-05
Source auditee: app locale `http://127.0.0.1:5174/`
Mode: audit combine UX, UI, accessibilite visible, responsive, architecture produit.

## Captures utilisees

1. `01-dashboard-desktop.png` - tableau principal desktop.
2. `02-settings-panel.png` - panneau parametres.
3. `03-streak-popover.png` - panneau streak.
4. `04-revisions-calendar.png` - page revisions, calendrier.
5. `05-revisions-methods.png` - page revisions, methodes.
6. `06-friends-leaderboard.png` - page amis, classement.
7. `07-friends-profile-detail.png` - detail profil ami.
8. `08-dashboard-mobile.png` - tableau principal mobile.
9. `09-revisions-calendar-mobile.png` - calendrier mobile.
10. `10-friends-mobile.png` - amis mobile.
11. `11-account-sync-popover.png` - compte/synchronisation.
12. `12-add-revision-modal.png` - ajout d'un cours de revision.

## Synthese courte

Muslim Study Place a une identite tres forte: fond immersif, widgets flottants, badges vivants, recompenses, Quran, Pomodoro, revisions, social. On sent une vraie "station d'etude" personnelle.

Le probleme principal n'est pas le manque de fonctionnalites. C'est l'inverse: l'app a grandi vite, et l'interface affiche maintenant trop de concepts au meme niveau. Widgets, pages plein ecran, popovers, modales, dock, badges, sync cloud, calendar, amis, flammes: tout existe, mais tout reclame l'attention en meme temps.

La prochaine etape de qualite doit etre une clarification de l'architecture d'experience: faire ressortir l'action du moment, cacher ce qui est secondaire, et rendre mobile vraiment natif au lieu d'etre une version compressee du desktop.

## Forces

- Identite memorable: l'app ne ressemble pas a un dashboard generique.
- Gamification motivante: streak, etoiles, flammes, exploits et animations donnent une vraie boucle de recompense.
- Bonne logique "outil de travail": Pomodoro, taches, revisions et calendrier sont connectes a un usage reel.
- Design system deja reconnaissable: verre sombre, or, vert, halos, icones lineaires, badges arrondis.
- Beaucoup d'etats existent deja: vide, connecte, conflit cloud, calendrier, profil, settings, mobile.
- Les controles essentiels sont souvent accessibles au clavier/lecteur d'ecran via labels ARIA visibles dans le DOM.

## Etapes auditees et etat de sante

1. Dashboard desktop - Sante: riche mais surcharge.
   L'identite est forte, les modules essentiels sont visibles, mais l'ecran presente trop d'objets concurrents avant meme que l'utilisateur commence a travailler.

2. Parametres - Sante: fonctionnel mais trop lineaire.
   Les reglages sont accessibles, mais leur ordre et leur densite demandent beaucoup de lecture.

3. Streak / progression - Sante: tres engageant, a canaliser.
   La flamme et les stats hebdo donnent envie, mais le systeme de recompenses prend une place mentale importante dans une app de focus.

4. Revisions calendrier - Sante: base solide, empty state trop faible.
   Le calendrier est propre, mais vide il ressemble surtout a une grande grille noire. L'action suivante devrait etre plus guidee.

5. Revisions methodes - Sante: clair mais sous-exploite.
   Les methodes sont lisibles, mais la page manque de structure d'edition et d'une CTA evidente dans le premier regard.

6. Amis / leaderboard - Sante: direction visuelle prometteuse.
   Le podium est sympathique et harmonise avec le reste, mais la page a besoin de mieux gerer les etats avec peu d'amis.

7. Detail profil ami - Sante: utile mais visuellement plat.
   Le tableau detaille donne les bonnes infos, mais il merite des regroupements plus lisibles et plus emotionnels autour des exploits.

8. Dashboard mobile - Sante: utilisable mais pas mobile-first.
   Le contenu principal arrive trop bas et la topbar/dock mangent beaucoup d'espace.

9. Calendrier mobile - Sante: fragile.
   La vue mois reste une logique desktop; une vue agenda devrait etre la valeur par defaut.

10. Amis mobile - Sante: a corriger en priorite.
    Le dock et le header se superposent visuellement et l'ecran donne l'impression d'une tranche de desktop.

11. Compte / sync - Sante: robuste mais anxiogene.
    Les choix existent, mais le wording et la presentation font sentir un risque de perte de donnees.

12. Ajout revision - Sante: complet mais dense.
    La modale contient les bons champs et le recap, mais devrait devenir progressive pour reduire l'effort initial.

## Risques UX majeurs

### 1. La page d'accueil manque d'un "prochain geste" evident

Evidence: `01-dashboard-desktop.png`, `08-dashboard-mobile.png`.

L'utilisateur voit immediatement beaucoup de surfaces: Pomodoro, revisions, taches, YouTube, fonds, dock, topbar, badges. Le bouton principal existe (`Demarrer` / `Pomodoro libre`), mais il n'est pas le centre mental de l'ecran car il se bat avec beaucoup d'autres elements.

Impact: au lancement, l'utilisateur doit comprendre son propre systeme avant de travailler. Pour une app de focus, c'est dangereux: chaque seconde de decision avant le travail fatigue un peu.

Recommendation concrete:
- Ajouter une zone "Maintenant" ou "Prochaine session" au centre de l'experience.
- Une seule CTA primaire: `Commencer ma prochaine session`.
- Cette zone decide automatiquement: tache active, revision due aujourd'hui, ou Pomodoro libre.
- Les widgets restent disponibles, mais deviennent secondaires.

Exemple:
`Aujourd'hui: 1 tache urgente + 0 revision due. Prochaine session: Quran revision. [Commencer 25 min]`

### 2. Deux modeles de navigation coexistent sans hierarchy claire

Evidence: `01-dashboard-desktop.png`, `04-revisions-calendar.png`, `06-friends-leaderboard.png`.

Il y a:
- des widgets flottants;
- des pages plein ecran internes;
- des popovers topbar;
- des modales;
- un dock qui ouvre a la fois des widgets et des pages.

Impact: l'utilisateur ne sait pas toujours si un bouton ouvre une fenetre, une page, un panneau temporaire, ou une fonctionnalite permanente.

Recommendation concrete:
- Separer explicitement:
  - Dock gauche = sections principales: Focus, Taches, Revisions, Amis, Media, Fonds.
  - Widgets flottants = uniquement outils epingles du tableau de bord.
  - Pages plein ecran = modules profonds, avec un header stable.
- Ajouter des labels textuels au dock au survol desktop et sous forme compactee mobile.
- Eviter qu'un meme concept existe en widget et page sans signal: `Tableau revisions` peut rester widget, mais `Calendrier/Methodes` doit etre presente comme "ouvrir le planner".

### 3. Le mobile n'est pas encore une experience mobile

Evidence: `08-dashboard-mobile.png`, `09-revisions-calendar-mobile.png`, `10-friends-mobile.png`.

Le mobile empile correctement certains widgets, mais les surfaces plein ecran gardent une logique desktop. Dans `10-friends-mobile.png`, le dock traverse la zone de contenu et perturbe la lecture des onglets Amis. Dans `09-revisions-calendar-mobile.png`, le calendrier garde une largeur minimale et donne l'impression d'un tableau desktop coupe.

Impact: sur telephone, l'utilisateur scrolle et devine plus qu'il ne navigue. Les actions importantes sont souvent sous le premier ecran.

Recommendation concrete:
- Remplacer le dock mobile par une vraie bottom navigation ou un rail horizontal fixe, avec 4-5 destinations max.
- Sur mobile, afficher par defaut:
  1. topbar ultra compacte;
  2. prochaine session;
  3. taches/revisions du jour;
  4. raccourcis.
- Pour le calendrier mobile, proposer une vue `Agenda` par defaut plutot que `Mois`.
- Garder la vue mois comme option secondaire scrollable.
- Les pages Amis/Revisions doivent avoir `width: 100vw`, pas une coque qui preserve une composition large.

### 4. Les etats vides sont jolis mais pas assez actionnables

Evidence: `01-dashboard-desktop.png`, `04-revisions-calendar.png`, `06-friends-leaderboard.png`.

Exemples:
- `Aucun cours pour aujourd'hui` explique mais n'amene pas assez directement a la creation.
- Le calendrier vide montre une grande grille noire: beaucoup d'espace, peu d'aide.
- Le leaderboard avec seulement soi est visuellement propre, mais pourrait mieux guider vers "copier mon code" ou "chercher un ami".

Recommendation concrete:
- Transformer chaque empty state en mini parcours:
  - Revisions: `Ajouter mon premier cours`, `Choisir une methode`, `Voir un exemple`.
  - Calendar: afficher 2-3 cartes fantomes expliquant `Cours initial`, `Revision J+3`.
  - Amis: `Copier mon code`, `Chercher un code`, `Comment le classement marche`.
- Les empty states doivent contenir une action directe dans le meme bloc, pas seulement un texte.

### 5. Le compte cloud cree de l'anxiete

Evidence: `11-account-sync-popover.png`.

`Choix requis`, icone alerte, puis trois options `Utiliser le cloud`, `Remplacer par ce PC`, `Exporter ce PC`. C'est fonctionnel, mais la situation est anxiogene: l'utilisateur ne sait pas quelle version est la plus recente, ce qu'il risque de perdre, ni ce qui sera fusionne.

Impact: la sync, qui devrait rassurer, devient un point de peur.

Recommendation concrete:
- Renommer l'etat en phrase moins alarmante: `Deux sauvegardes trouvees`.
- Afficher deux cartes comparables:
  - Cloud: derniere sync, nombre de taches, etoiles, streak.
  - Ce PC: derniere modification, nombre de taches, etoiles, streak.
- Ajouter un choix recommande: `Garder la version la plus recente`.
- Garder `Exporter ce PC` comme filet de securite, mais moins dominant que le choix recommande.

### 6. Les recompenses sont puissantes, mais elles prennent trop de surface permanente

Evidence: `03-streak-popover.png`, topbar dans toutes les captures.

Les badges sont beaux et motivants. Mais en topbar, ils consomment beaucoup de place et s'ajoutent au lecteur Quran et au compte. Les panneaux de recompense sont riches, parfois plus riches que les outils de travail eux-memes.

Impact: la recompense risque de devenir plus visible que l'action et la progression concrete.

Recommendation concrete:
- Garder en topbar 3 tokens ultra compacts: streak, record, etoiles.
- Deplacer l'histoire complete vers une page `Progression` ou `Exploits`.
- Dans le panneau streak, mettre en premier:
  1. streak actuelle;
  2. objectif du jour;
  3. semaine;
  4. secrets, plus bas.
- Eviter que les secrets/flammes occupent le premier niveau de l'interface quotidienne.

### 7. La page Revisions a besoin d'une vraie hierarchie de travail

Evidence: `04-revisions-calendar.png`, `05-revisions-methods.png`, `12-add-revision-modal.png`.

Le calendrier est propre mais froid: beaucoup de grille vide. La page Methodes montre trois grandes cartes mais peu de CTA visible dans la capture. La modale d'ajout est complete, mais elle expose tout en une seule fois.

Recommendation concrete:
- Dans Revisions, organiser en 3 modes utilisateur:
  - `Aujourd'hui`: que dois-je reviser maintenant ?
  - `Calendrier`: quand mes revisions tombent-elles ?
  - `Methodes`: comment les rappels sont-ils generes ?
- Ajouter un bandeau onboarding dans calendrier vide: `Ajoute un cours pour generer automatiquement J+0, J+3...`
- Dans la modale ajout cours:
  - Etape 1: nom, date, methode.
  - Etape 2: details optionnels: professeur, partie, notes, exclusions.
  - Etape 3: recap des dates + bouton.
- Garder le recap sticky a droite sur desktop, sous le formulaire sur mobile.

### 8. Les Settings sont utiles mais trop lineaires

Evidence: `02-settings-panel.png`.

Le panneau est long et dense. Il melange langue, widgets, Pomodoro, flamme, stockage, fond, credits. C'est logique techniquement, mais pas mentalement.

Recommendation concrete:
- Transformer Settings en sections avec mini navigation:
  - General;
  - Interface;
  - Focus;
  - Recompenses;
  - Donnees;
  - A propos.
- Rendre les reglages frequents visibles en haut: durees Pomodoro, widgets affiches, fond.
- Cacher les reglages rares dans des accordions.

### 9. Le style visuel est fort, mais le contraste de niveaux est parfois flou

Evidence: toutes captures desktop.

Le verre sombre, les halos, les ombres, les contours et les fonds animes donnent une atmosphere premium. Mais presque toutes les surfaces ont une presence visuelle comparable: cartes, inputs, boutons, widgets, popovers. Le regard ne sait pas toujours ce qui est primaire.

Recommendation concrete:
- Definir 4 niveaux visuels:
  1. Fond: decoratif, jamais concurrent.
  2. Surface: panneaux neutres, faible glow.
  3. Action: boutons or/verts, visibles.
  4. Recompense: glow/animation, reserve aux moments de celebration.
- Reduire les bordures lumineuses sur les cartes passives.
- Garder le gold pour les actions ou selections, pas pour toutes les surfaces.
- Uniformiser les paddings: widgets 14px, pages 24px, modales 24px.

### 10. L'accessibilite visible est correcte par endroits, mais plusieurs risques restent

Evidence: DOM snapshots + captures.

Risques visibles:
- Beaucoup de texte muted sur verre/fond image: contraste probablement limite selon les zones du fond.
- Plusieurs controles icon-only reposent sur `title`/aria-label, mais la comprehension visuelle sans hover est faible.
- Les interactions drag/resize ne semblent pas avoir d'equivalent clavier evident.
- Le mouvement est central dans l'identite; il faut garder `prefers-reduced-motion` strict et verifier tous les nouveaux effets.
- Les pages plein ecran ont beaucoup de scroll interne; risque de piege de focus dans modales/popovers.
- Sur mobile, le dock peut masquer ou couper la lecture de surfaces plein ecran.

Recommendations concretes:
- Ajouter un mode contraste fort dans les settings.
- Ajouter un focus ring plus visible que le simple `outline-color`.
- Assurer que chaque tab a `aria-selected` et role `tab`/`tabpanel` complet.
- Ne pas utiliser le drag comme seule methode d'organisation: ajouter `Recentrer`, `Envoyer au premier plan`, `Restaurer taille`.
- Tester clavier: ouvrir dock, changer onglet, fermer modale, remplir ajout cours.

## Quick wins prioritaires

### Quick win 1 - Corriger le mobile Amis/Revisions

Priorite: tres haute.

- Dock mobile en bottom nav ou rail sticky non superpose.
- Pages `friends-page` et `revision-planner-page` en largeur viewport reelle.
- Revisions mobile: vue liste/agenda par defaut.
- Amis mobile: onglets sous le header, puis code ami, puis classement; pas de grille desktop.

### Quick win 2 - Ajouter une CTA "Prochaine session"

Priorite: tres haute.

- Nouveau bloc en haut du dashboard: `Prochaine session`.
- Si tache active: lancer cette tache.
- Si revision due: lancer la revision.
- Sinon: Pomodoro libre.
- Le bouton doit etre plus clair que tous les autres.

### Quick win 3 - Rendre les empty states actionnables

Priorite: haute.

- `Aucun cours pour aujourd'hui` -> bouton `Ajouter un cours`.
- Calendar vide -> bouton `Ajouter une revision`, plus exemple visuel.
- Friends vide -> `Copier mon code` + `Chercher un ami`.
- Methodes -> bouton `Ajouter une methode` visible dans le premier viewport.

### Quick win 4 - Clarifier la sync cloud

Priorite: haute.

- Remplacer `Choix requis` par `Deux sauvegardes trouvees`.
- Afficher un comparatif cloud vs ce PC.
- Ajouter `Recommande` sur l'option la plus recente ou la plus complete.

### Quick win 5 - Reduire le bruit visuel passif

Priorite: moyenne.

- Diminuer glow/bordures sur les cartes inactives.
- Garder les effets intenses pour completion, unlock, etoile, streak.
- Mettre les panneaux passifs sur un verre plus calme.

## Chantiers moyens

### Chantier 1 - Repenser l'architecture en 5 espaces

Proposition:

1. Aujourd'hui: prochaine session, taches, revisions du jour.
2. Planner: calendrier + methodes + cours.
3. Progression: flammes, streak, etoiles, exploits.
4. Social: amis, leaderboard, profil.
5. Espace: fond, Quran, YouTube, parametres.

Le dock devient une navigation stable entre ces espaces. Les widgets deviennent des "cartes epinglees" dans Aujourd'hui, pas la structure principale de toute l'app.

### Chantier 2 - Faire de Revisions un produit dans le produit

- Dashboard revision autonome: aujourd'hui, en retard, semaine.
- Calendar = vue planification.
- Methodes = configuration.
- Detail cours = historique, prochaines dates, moyenne de completions.
- Creation cours = wizard.

### Chantier 3 - Centraliser les recompenses

- Page Progression avec:
  - streak;
  - etoiles;
  - meilleure suite;
  - flammes;
  - registre des exploits;
  - evolution hebdo.
- Topbar reste compacte.
- Les grandes animations apparaissent seulement au bon moment.

### Chantier 4 - Design system plus strict

- Tokens de surface: panel, panel-raised, modal, popover.
- Tokens d'action: primary, secondary, danger, ghost.
- Tokens de texte: title, body, meta, danger.
- Composants communs pour cards stats, tabs, filters, empty states, modals.
- Objectif: eviter que chaque nouvelle feature invente son micro-style.

## Chantiers lourds

### Chantier lourd 1 - Mode focus radical

Quand l'utilisateur demarre une session:
- cacher dock, YouTube, fonds, widgets secondaires;
- garder timer, tache/revision active, Quran si utile;
- afficher une sortie claire;
- afficher les recompenses seulement a la fin.

But: passer de "je configure mon espace" a "je travaille maintenant".

### Chantier lourd 2 - Responsive mobile natif

Mobile ne doit pas etre le desktop empile.

Structure proposee:
- Bottom nav: Aujourd'hui, Planner, Progression, Amis, Plus.
- Topbar: seulement avatar + streak + etoiles.
- Timer en carte principale.
- Calendrier mobile: agenda/listWeek par defaut.
- Les widgets draggable disparaissent sur mobile.

### Chantier lourd 3 - Performance et maintenabilite UI

Evidence code:
- `src/App.tsx`: environ 2446 lignes.
- `src/index.css`: environ 8233 lignes.
- `RevisionPlannerPage.tsx`: environ 848 lignes.
- `FriendsPage.tsx`: environ 690 lignes.
- Build: gros chunks JS/CSS et avertissement Vite sur la taille.

Recommendations:
- Code-splitting des pages lourdes: Revisions, Friends, YouTube, Three/backgrounds.
- Sortir les hooks metier de `App.tsx`: `usePomodoroController`, `useRevisionPlanner`, `useSocialStats`, `useWorkspaceLayout`.
- Fractionner CSS par feature ou utiliser des fichiers de modules par surface.
- Lazy-load FullCalendar uniquement quand la page Revisions s'ouvre.

## Recommandation d'ordre d'execution

1. Corriger mobile dock/pages plein ecran.
2. Ajouter `Prochaine session`.
3. Refaire empty states avec CTA.
4. Clarifier cloud conflict.
5. Revisions: wizard d'ajout + agenda mobile.
6. Progression: page dediee aux recompenses.
7. Design system tokens + composants communs.
8. Code splitting et separation des hooks.

## Limites de l'audit

- Audit base sur captures et DOM local; pas de test utilisateur reel.
- Les contrastes n'ont pas ete mesures avec un outil WCAG pixel par pixel.
- Les parcours avec donnees riches sont limites par l'etat local actuel: calendrier presque vide, peu d'amis, pas de gros historique de revisions.
- Les animations ont ete observees indirectement, pas toutes rejouees une par une.
- La sync Google Calendar et Supabase n'a pas ete testee bout en bout dans cet audit, seulement son etat UI visible.

## Verdict

L'app est deja plus interessante que beaucoup d'outils de productivite: elle a une ame, une boucle de recompense et des fonctions serieuses. Le prochain saut de qualite n'est pas d'ajouter encore plus. C'est de mieux choregraphier ce qui existe.

La direction ideale: une experience calme pour travailler, spectaculaire pour celebrer, et structuree pour planifier.
