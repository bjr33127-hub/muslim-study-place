# Muslim Study Place

A cosy halal study dashboard inspired by Astrostation, rebuilt for Quran-first focus sessions.

## Features

- Exact Astrostation train background video as the default animated background.
- Floating desktop widgets with mobile stacking.
- Pomodoro focus timer.
- Finished state with a small star animation, audible chime, and full stop when the current pomodoro objective is complete.
- Persistent todo list with priorities, search, sorting, drag-and-drop ordering, redo history, and task-level Start/Pause controls.
- Configurable Pomodoro durations and long-break cadence.
- Addictive focus flame streak plus best continuous pomodoro streak.
- Minimal glass Quran mini-player using the Quran.com API with selectable reciters and all 114 chapters.
- YouTube widget shown by default with the configured Quran playlist and replaceable URL.
- Built-in local backgrounds: Train, Oasis, Japan, Night Cosy, plus 50 generated halal landscape wallpapers.
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

The default collection now also includes 50 generated still-image wallpapers in `public/backgrounds/generated/`, all built as pure landscapes with no visible living beings.

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
