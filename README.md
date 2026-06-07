# Fitness World GymOS

Tablet-first member management system for Fitness World Gym.

## Local Development

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`

Backend health: `http://localhost:4000/health`

Without Supabase environment variables, the frontend uses in-memory demo data after trainer sign in so the UI can be reviewed locally. Add the environment variables from `.env.example` to connect production services.

## Structure

- `frontend` — React 19, Vite, TypeScript, Tailwind CSS v4, Motion, Zustand, React Hook Form, Zod, TanStack Table.
- `backend` — Express 5, TypeScript, Supabase Auth/Database, Fast2SMS, node-cron.
- `workers/gymos-api` — Cloudflare Worker backend for no-card deployment, with Supabase REST/Auth and cron jobs.
- `supabase/migrations` — database schema, generated columns, triggers, indexes, grants, and RLS.
- `docs` — deployment and keep-alive setup.
