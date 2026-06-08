# Fitness World GymOS Cloudflare Worker API

This Worker is the no-card backend deployment path for Fitness World GymOS. It mirrors the Express API used by the Vercel frontend and talks to Supabase through the REST/Auth APIs.

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
   npx wrangler secret put FAST2SMS_API_KEY
   npx wrangler secret put FRONTEND_URLS
   npx wrangler secret put TRAINER_EMAILS
   ```

   `FRONTEND_URLS` should be comma-separated:

   ```text
   http://localhost:5173,http://127.0.0.1:5173,https://your-vercel-app.vercel.app
   ```

   `TRAINER_EMAILS` should be the exact comma-separated trainer email allowlist:

   ```text
   developer@fitnessworld.in,trainer@fitnessworld.in,trainer2@fitnessworld.in
   ```

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

These scheduled jobs also touch Supabase daily, so they help prevent Supabase inactivity sleep.
