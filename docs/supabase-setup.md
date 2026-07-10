# Supabase Google Login Setup

This app uses Supabase Free for Google login, cloud progress sync, and server-time streak updates.

Project URL:

```bash
https://boucposhlzjnzrrqjazd.supabase.co
```

GitHub Pages URL:

```bash
https://bjr33127-hub.github.io/muslim-study-place/
```

## 1. Create the project

1. Create a free Supabase project.
2. Open the SQL editor.
3. Run `supabase/migrations/20260617000000_cloud_progress.sql`.
4. Run `supabase/migrations/20260704000000_social_leaderboard.sql`.
5. Run `supabase/migrations/20260704001000_friend_codes_leaderboard.sql`.
6. Run `supabase/migrations/20260705000000_social_stats_details.sql`.
7. Run `supabase/migrations/20260709224456_improve_friend_invites.sql`.

## 2. Configure Google OAuth

1. In Google Cloud, create an OAuth Client ID of type `Web application`.
2. Add local and production origins:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `http://localhost:5174`
   - `http://127.0.0.1:5174`
   - `https://bjr33127-hub.github.io`
3. Add the Supabase callback URL shown in Supabase Auth > Providers > Google. For this project it should look like:
   - `https://boucposhlzjnzrrqjazd.supabase.co/auth/v1/callback`
4. In Supabase Auth > Providers > Google, paste the Google Client ID and Client Secret.
5. In Supabase Auth > URL Configuration, set the site URL and redirect allow list:
   - Site URL: `https://bjr33127-hub.github.io/muslim-study-place/`
   - Redirect URLs:
     - `http://localhost:5173/`
     - `http://127.0.0.1:5173/`
     - `http://localhost:5174/`
     - `http://127.0.0.1:5174/`
     - `https://bjr33127-hub.github.io/muslim-study-place/`

## 3. Add local env vars

Copy `.env.example` to `.env.local` and fill:

```bash
VITE_SUPABASE_URL=https://boucposhlzjnzrrqjazd.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
VITE_GOOGLE_CALENDAR_CLIENT_ID=your-google-calendar-web-client-id
```

Add this value as a GitHub Actions **Secret** so every production deploy
applies the migrations before publishing the frontend:

```text
SUPABASE_ACCESS_TOKEN=your-personal-access-token
```

The token is used by `scripts/deploy-supabase-migrations.mjs` with Supabase's
Management API. The script compares the latest remote migration version and
applies only newer SQL files. The deployment stops when the secret is missing.
This prevents a new
frontend from going live against an older schema, which otherwise breaks friend
codes, invitations, or the leaderboard independently.

Do not commit `.env.local`.

## 4. Add GitHub Pages variables

GitHub Pages builds the static app on GitHub, so it also needs the same Vite variables at build time.

Add repository variables in GitHub:

`Settings > Secrets and variables > Actions > Variables`

Required variables:

```bash
VITE_SUPABASE_URL=https://boucposhlzjnzrrqjazd.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
VITE_GOOGLE_CALENDAR_CLIENT_ID=your-google-calendar-web-client-id
```

The deploy workflow `.github/workflows/deploy-pages.yml` publishes `dist` to the existing `gh-pages` branch.

## Notes

- When signed in, Supabase is the cloud source of truth and local storage is an offline cache.
- If both this PC and the cloud already have progress, the account menu asks which version to keep.
- Daily streak dates are computed in Postgres with `now()` and the browser timezone.
- Google Calendar sync is one-way: Muslim Study Place creates, updates, and deletes only its own revision events in the user's primary Google Calendar.
- Google Calendar sync is session-based: after a refresh, reconnect Calendar from the Revisions page before autosync resumes.
- The Google Calendar access token is kept in memory for the current browser session only; only Google event IDs and sync counts are stored locally/cloud.
- Friends use personal friend codes, not email invitations. The leaderboard uses Supabase tables with RLS and compares weekly stars among accepted friends only.

## 5. Enable Google Calendar sync

1. In Google Cloud, enable the Google Calendar API for the same project.
2. Keep the OAuth Client ID type as `Web application`.
3. Add the same authorized JavaScript origins used for Google login:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `http://localhost:5174`
   - `http://127.0.0.1:5174`
   - `https://bjr33127-hub.github.io`
4. Add the client ID to local `.env.local` and GitHub Actions variables:
   `VITE_GOOGLE_CALENDAR_CLIENT_ID=...`
5. The app requests only:
   `https://www.googleapis.com/auth/calendar.events.owned`
6. If the page says `Configuration requise`, the app was built without `VITE_GOOGLE_CALENDAR_CLIENT_ID`.
7. If the page says `Reconnecter Calendar`, Google Calendar is configured but the in-memory Google token was lost after refresh; reconnect once for the current session.

## 6. Enable friends and leaderboard

For a first manual setup, run the social migrations in Supabase SQL Editor, in this order:

1. `supabase/migrations/20260704000000_social_leaderboard.sql`
2. `supabase/migrations/20260704001000_friend_codes_leaderboard.sql`
3. `supabase/migrations/20260705000000_social_stats_details.sql`
4. `supabase/migrations/20260709224456_improve_friend_invites.sql`

Once `SUPABASE_ACCESS_TOKEN` is configured, later GitHub deployments apply new
migration files automatically.

If the Friends page says `Configuration Amis Supabase requise`, the app can sign in but the code-based friends RPCs or tables are missing on the remote project.

## Troubleshooting

If clicking Google opens a Supabase URL and returns:

```json
{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
```

Google is not enabled in Supabase yet.

Fix:

1. Open Supabase Dashboard > Authentication > Sign In / Providers.
2. Enable Google.
3. Paste the Google OAuth Client ID and Client Secret.
4. Save.
5. Keep the callback URL in Google Cloud exactly as:
   `https://boucposhlzjnzrrqjazd.supabase.co/auth/v1/callback`
