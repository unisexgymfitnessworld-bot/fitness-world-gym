# Fitness World GymOS — Production Deployment Checklist & Handbook

This document lists the step-by-step production checklist and handover procedures for the **Fitness World GymOS** application.

---

## 1. Production URL Checklist

Update these placeholders once the production environments are provisioned:

- **Frontend URL (Vercel)**: `https://fitness-world.vercel.app` (or custom domain)
- **Backend URL (Cloudflare Worker)**: `https://fitness-world-gymos-api.your-subdomain.workers.dev`
- **Database Dashboard (Supabase)**: `https://supabase.com/dashboard/project/your-project-id`

---

## 2. Step-by-Step Deployment Steps

### Phase A: Supabase Setup (Database & Auth)
1. **Create Project**: Sign in to [supabase.com](https://supabase.com) and create a new project.
2. **Execute Migrations**: Run the SQL script from `supabase/migrations/202606070001_create_fitness_world_schema.sql` in the Supabase SQL Editor to configure tables, indexes, triggers, and RLS policies.
   Then run `supabase/migrations/202606080001_add_member_owner_isolation.sql` so each trainer workspace has isolated member ownership.
3. **Copy Secrets**: Retrieve the following from **Settings** → **API**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Keep secure)

### Phase A.1: Supabase Auth Security Settings
1. In Supabase Dashboard, open **Authentication** → **Sign In / Providers**.
2. Disable public signups unless the client explicitly needs self-registration.
3. Open **Authentication** → **Security** or **Password protection**.
4. Enable leaked password protection.
5. Keep trainer account passwords unique and rotate them before handover.

### Phase B: Backend Setup on Cloudflare Workers (No Card REST API)
1. **Login to Cloudflare**:
   ```bash
   cd workers/gymos-api
   npx wrangler login
   ```
2. **Add Worker Secrets**:
   ```bash
   npx wrangler secret put SUPABASE_ANON_KEY
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put FAST2SMS_API_KEY
   npx wrangler secret put FRONTEND_URLS
   npx wrangler secret put TRAINER_EMAILS
   ```
   Set `FRONTEND_URLS` to a comma-separated list, for example:
   ```text
   http://localhost:5173,http://127.0.0.1:5173,https://your-app.vercel.app
   ```
   Set `TRAINER_EMAILS` to the exact trainer allowlist:
   ```text
   vedasaradhiv@gmail.com,fitnessworld@gmail.com,trainer@fitnessworld.in
   ```
   Accounts created later from the developer console are authorized by Supabase `app_metadata.role`. Developer accounts see the system health console only; trainer accounts see isolated gym member data.
3. **Deploy Worker**:
   ```bash
   npx wrangler deploy
   ```
4. **Verify Health**:
   Open `https://fitness-world-gymos-api.your-subdomain.workers.dev/health`.
5. **Seed Trainer Accounts**:
   Run the seed script locally after adding the Supabase secrets and strong trainer passwords:
   ```bash
   SUPABASE_URL="your-url" \
   SUPABASE_SERVICE_ROLE_KEY="your-key" \
   TRAINER_SEED_ACCOUNTS="vedasaradhiv@gmail.com:strong-password-here:developer,fitnessworld@gmail.com:strong-password-here:trainer,trainer@fitnessworld.in:strong-password-here:trainer" \
   npm run seed:trainers
   ```
   Use unique passwords with at least 12 characters. Do not use shared demo passwords in production. The developer account is labeled with developer metadata, while the other two are trainer accounts.

### Phase C: Frontend Setup on Vercel
1. **Connect Repo**: Import the repository on [vercel.com](https://vercel.com).
2. **Configure App settings**:
   - Framework Preset: `Vite`
   - Root Directory: `frontend`
3. **Define Environment Variables**:
   - `VITE_SUPABASE_URL=https://your-project.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key`
   - `VITE_API_BASE_URL=https://fitness-world-gymos-api.your-subdomain.workers.dev/api`
4. **Add Supabase Redirect URL for password reset**:
   - Open Supabase Dashboard -> Auth -> URL Configuration.
   - Add `https://your-vercel-app.vercel.app/reset-password` to allowed redirect URLs.
   - Keep local development redirect too if needed: `http://localhost:5173/reset-password`.
5. **Deploy**: Build and verify.

---

## 3. Keep-Alive Configuration

To prevent free tiers from pausing:
1. **Cloudflare Worker Cron (Primary)**:
   - `30 18 * * *` updates expired members at 00:00 Asia/Kolkata.
   - `30 3 * * *` sends SMS reminders at 09:00 Asia/Kolkata.
   - Both jobs touch Supabase every day, which helps prevent Supabase inactivity sleep.
2. **UptimeRobot (Optional Worker Health Monitor)**:
   - Create a free account on [uptimerobot.com](https://uptimerobot.com).
   - Add a monitor → HTTP(s) → URL: `https://fitness-world-gymos-api.your-subdomain.workers.dev/health`.
   - Set interval to **5 minutes** with email alerts.
3. **GitHub Actions (Optional Supabase Backup Keep-Alive)**:
   - Save `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repository secrets.
   - The workflow in `.github/workflows/keep-supabase-alive.yml` will trigger every 5 days to query the database and keep the instance warm.

---

## 4. SMS Management & Fast2SMS Recharge

The system uses **Fast2SMS** for automated dues alerts.
- **Cost**: ~₹0.25 per SMS.
- **Low Balance Indicator**: If the wallet balance falls to zero, automated alerts will fail. Check Cloudflare Worker logs for `FAST2SMS_FAILED` errors.
- **Recharge Instructions**:
  1. Login to the client account at [fast2sms.com](https://fast2sms.com).
  2. Navigate to the **Wallet / Add Credits** section.
  3. Load a minimum of ₹100 using UPI/Card.
  4. Ensure the API key remains the same. If regenerated, update the `FAST2SMS_API_KEY` Worker secret and redeploy.
