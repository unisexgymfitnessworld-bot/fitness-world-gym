# Fitness World GymOS Cloudflare Worker API

This Worker is the backend for Fitness World GymOS. It serves the Vercel frontend
and talks to Supabase through the REST/Auth APIs.

## Deploy

1. Login to Cloudflare:

   ```bash
   cd workers/gymos-api
   npx wrangler login
   ```

2. Add Worker secrets. Use the Supabase publishable key for `SUPABASE_ANON_KEY`; use the service role or secret key for `SUPABASE_SERVICE_ROLE_KEY`.

   ```bash
   npx wrangler secret put SUPABASE_ANON_KEY
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put FRONTEND_URLS
   npx wrangler secret put TRAINER_EMAILS
   npx wrangler secret put SMSGATE_USERNAME
   npx wrangler secret put SMSGATE_PASSWORD
   ```

   `FRONTEND_URLS` should be comma-separated:

   ```text
   http://localhost:5173,http://127.0.0.1:5173,https://your-vercel-app.vercel.app
   ```

   `TRAINER_EMAILS` should be the exact comma-separated trainer email allowlist:

   ```text
   vedasaradhiv@gmail.com,fitnessworld@gmail.com,trainer@fitnessworld.in
   ```

   New accounts created from the developer console are authorized by Supabase `app_metadata.role`.

   SMS credentials can also be entered later from the app (Settings → SMS Setup,
   open to trainers and developers) instead of secrets. Optional: `SMSGATE_DEVICE_ID` (pin sending to one phone),
   `SMSGATE_SIM_NUMBER` (SIM slot to send from).

3. Deploy:

   ```bash
   npx wrangler deploy
   ```

4. Set this on Vercel:

   ```text
   VITE_API_BASE_URL=https://fitness-world-gymos-api.<your-subdomain>.workers.dev/api
   ```

## Scheduled Jobs

Cloudflare cron runs in UTC.

- `30 18 * * *` updates expired members at 00:00 Asia/Kolkata.
- `30 3 * * *` sends SMS reminders at 09:00 Asia/Kolkata.
- `*/10 * * * *` pings Supabase to prevent inactivity sleep.

These scheduled jobs also touch Supabase daily, so they help prevent Supabase inactivity sleep.

## SMS

All messages are sent through the gym Android phone running the SMSGate app.
Free; uses the SIM pack. Requires cloud-account credentials. Keep the phone on,
online, and plugged in at the gym desk — if the phone is unreachable, SMS fails
and the error is logged.

## Local Dev

Copy `.dev.vars.example` to `.dev.vars` (gitignored) and run `npx wrangler dev`.
