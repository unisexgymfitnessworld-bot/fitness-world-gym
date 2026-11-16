# Fitness World GymOS

Tablet-first member management system for Fitness World Gym.

## Local Development

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

Point `VITE_API_BASE_URL` at the deployed Cloudflare Worker API (see `.env.example`).
In dev only (`npm run dev`), without Supabase environment variables, the frontend
shows clearly-labeled demo data after sign in so the UI can be reviewed locally.
Production builds need the real environment variables — there is no demo mode
in prod. Add the variables from `.env.example` to connect production services.

## Structure

- `frontend` — React 19, Vite, TypeScript, Tailwind CSS v4, Motion, Zustand, React Hook Form, Zod, TanStack Table. Deployed to Vercel.
- `workers/gymos-api` — Cloudflare Worker API (the only backend): Supabase REST/Auth, SMSGate SMS reminders, cron jobs.
- `supabase/migrations` — database schema, generated columns, triggers, indexes, grants, and RLS. Run all files in name order on a fresh database.
- `supabase/APPLY_MISSING_MIGRATIONS.sql` — one-file catch-up for live databases that missed migrations. Run sections in order.
- `appsscript/Code.gs` — Google Apps Script mailer (email channel for bills). Paste into a script project, deploy, save URL + secret in Settings.
- `docs` — deployment, audit, and keep-alive setup. `docs/handouts` holds the gym phone APK and reference media (not app code).
- `.github/workflows` — scheduled Supabase keep-alive ping.

## Messaging

Automated SMS reminders go through a gym Android phone running
[SMSGate](https://github.com/capcom6/android-sms-gateway) (free, uses the SIM pack).
Install `docs/handouts/smsgate-v1.78.2-release.apk` on the gym phone and keep it
on and online. A developer saves the SMSGate credentials in Settings → SMS
Notifications after deploying (connection settings are developer-only).
