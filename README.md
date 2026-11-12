# Fitness World GymOS

Tablet-first member management system for Fitness World Gym.

## Local Development

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

Point `VITE_API_BASE_URL` at the deployed Cloudflare Worker API (see `.env.example`).
Without Supabase environment variables, the frontend shows clearly-labeled demo data
after sign in so the UI can be reviewed locally. Add the environment variables from
`.env.example` to connect production services.

## Structure

- `frontend` — React 19, Vite, TypeScript, Tailwind CSS v4, Motion, Zustand, React Hook Form, Zod, TanStack Table.
- `workers/gymos-api` — Cloudflare Worker API (the only backend): Supabase REST/Auth, SMSGate SMS reminders, cron jobs.
- `supabase/migrations` — database schema, generated columns, triggers, indexes, grants, and RLS. Run all files in name order.
- `docs` — deployment and keep-alive setup.

## Messaging

Automated SMS reminders go through a gym Android phone running
[SMSGate](https://github.com/capcom6/android-sms-gateway) (free, uses the SIM pack).
Keep the phone on and online. Configure credentials in Settings → SMS Setup
after deploying (trainers and developers both can do this).
