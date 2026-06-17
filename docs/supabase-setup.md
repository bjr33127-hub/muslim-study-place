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
```

Do not commit `.env.local`.

## 4. Add GitHub Pages variables

GitHub Pages builds the static app on GitHub, so it also needs the same Vite variables at build time.

Add repository variables in GitHub:

`Settings > Secrets and variables > Actions > Variables`

Required variables:

```bash
VITE_SUPABASE_URL=https://boucposhlzjnzrrqjazd.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
```

The deploy workflow `.github/workflows/deploy-pages.yml` publishes `dist` to the existing `gh-pages` branch.

## Notes

- When signed in, Supabase is the cloud source of truth and local storage is an offline cache.
- If both this PC and the cloud already have progress, the account menu asks which version to keep.
- Daily streak dates are computed in Postgres with `now()` and the browser timezone.

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
