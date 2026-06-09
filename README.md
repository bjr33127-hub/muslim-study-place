# Muslim Study Place

A cosy halal study dashboard inspired by Astrostation, rebuilt for Quran-first focus sessions.

## Features

- Exact Astrostation train background video as the default animated background.
- Floating desktop widgets with mobile stacking.
- Pomodoro focus timer.
- Finished state with a small star animation, audible chime, and full stop when the current pomodoro objective is complete.
- Persistent todo list with configurable pomodoro targets per task and task-level Start/Pause controls.
- Persistent notes widget with categories, search, pinning, and autosave.
- Configurable Pomodoro durations and long-break cadence.
- Addictive focus flame streak plus best continuous pomodoro streak.
- Spotify launcher for the `Omar Bn DiaaAldeen` playlist, opened in Spotify for full playback.
- Liquid in-site Quran audio player with Omar Diaa Aldeen recitations.
- YouTube embed defaulting to Omar Bn DiaaAldeen, hidden behind a neutral load panel until clicked.
- Built-in local backgrounds: Train, Oasis, Japan, and Night Cosy.
- Optional bright WebGL magic dust particles on image backgrounds.
- Background picker with local uploads stored in IndexedDB.
- Folder background support through `public/backgrounds/manifest.json`.
- Real settings panel with widget toggles, layout reset, background dimming, streak target, and Astrostation creator credit.

## Add Folder Backgrounds

Put image or video files in `public/backgrounds`, then add entries to `public/backgrounds/manifest.json`:

```json
[
  {
    "id": "rain-window",
    "label": "Rain Window",
    "kind": "video",
    "src": "rain-window.mp4"
  }
]
```

Use only imagery that fits the halal visual rules of the project.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run qa
```

`npm run qa` expects the dev server to be running at `http://127.0.0.1:5174/`, or set `QA_URL`.

## Attribution

The train background is from Astrostation and is attributed in `public/ATTRIBUTION.md`.
