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
2. **Execute Migrations**: Run every file in `supabase/migrations/` **in name order** in the Supabase SQL Editor:
   - `202606070001_create_fitness_world_schema.sql` (members, attendance, triggers, RLS)
   - `202606080001_add_member_owner_isolation.sql` (creator audit column)
   - `202606090002_add_member_fields.sql` (training type, partial payments)
   - `202606100001_add_payment_receipts.sql` (receipt ledger)
   - `202606100002_add_renewal_history.sql` (renewal ledger)
   - `202606100003_add_whatsapp_sessions.sql` (legacy table, safe to keep)
   - `202606120002_add_deleted_status.sql` (soft-delete status)
   - `202606130001_create_system_settings.sql` (runtime settings store)
   - `202606140001_add_winback_flag.sql` (one-time win-back flag for long-expired members)
   - `202606150001_remove_fast2sms_settings.sql` (drops obsolete Fast2SMS/provider settings)
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

### Phase B: Backend Setup on Cloudflare Workers

1. **Login to Cloudflare**:
   ```bash
   cd workers/gymos-api
   npx wrangler login
   ```
2. **Add Worker Secrets**:
   ```bash
   npx wrangler secret put SUPABASE_ANON_KEY
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put FRONTEND_URLS
   npx wrangler secret put TRAINER_EMAILS
   npx wrangler secret put SMSGATE_USERNAME
   npx wrangler secret put SMSGATE_PASSWORD
   ```
   Set `FRONTEND_URLS` to a comma-separated list, for example:
   ```text
   http://localhost:5173,http://127.0.0.1:5173,https://your-app.vercel.app
   ```
   Set `TRAINER_EMAILS` to the exact trainer allowlist:
   ```text
   vedasaradhiv@gmail.com,fitnessworld@gmail.com,trainer@fitnessworld.in
   ```
   Accounts created later from the developer console are authorized by Supabase `app_metadata.role`. Developer accounts see the system health console only; trainer accounts share the gym workspace.
3. **Deploy Worker**:
   ```bash
   npx wrangler deploy
   ```
4. **Verify Health**:
   Open `https://fitness-world-gymos-api.your-subdomain.workers.dev/health`.
5. **Create the first developer account**:
   Create it in Supabase Dashboard → **Authentication** → **Users** → **Add user** (auto-confirm email), then set its `app_metadata` to `{"role": "developer"}` via the user editor. Sign in with it and create the remaining trainer accounts from the developer console → Account Manager. Use unique passwords with at least 12 characters.

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

## 3. SMS Setup (SMSGate only)

Automated reminders are SMS-only. The gym Android phone sends them for free through
[SMSGate](https://github.com/capcom6/android-sms-gateway). There is no fallback
provider: the phone must stay on and online, or SMS sending fails and the error
is logged.

The 09:00 IST job runs three sweeps: members due in 1–3 days (each reminded once,
with catch-up if a day was missed), members due today (including plans the
midnight job just expired for non-payment), and a one-time win-back for members
expired more than 15 days ago. Note: on the first run after deploying, every
long-expired member gets one win-back SMS each, so expect a burst that day.

1. **Install the SMSGate app** on the gym phone from the project's Releases page and grant SMS permissions.
2. **Register a cloud account** inside the app (needed so the Worker API can reach the phone over the internet).
3. **Enter the credentials** in GymOS → Settings (gear icon) → SMS Setup tab (trainers and developers both can do this): username, password, optional device ID / SIM number. Save, then use the built-in test box to send yourself a test message.
4. **Keep the phone on, online, and plugged in** at the gym desk on a recharge that includes SMS (most unlimited packs include 100 SMS/day). Turn off battery optimization for the SMS Gateway app so Android does not kill it.

---

## 4. Upgrading From the WhatsApp Build

- WhatsApp (Baileys gateway service, UltraMsg, Twilio) is removed. Messaging is SMS-only via SMSGate (gym phone).
- Runtime settings moved from the `whatsapp_sessions` table to the `system_settings` table. After deploying, **re-enter SMS credentials once** in Settings → SMS Setup (open to trainers and developers), then send a test from the built-in test box.
- The legacy `whatsapp_sessions` table can be left in place. Optional cleanup (Supabase SQL Editor): `drop table if exists public.whatsapp_sessions;`
- Delete the old Render `gymos-whatsapp-gateway` service if it still exists.

---

## 5. Keep-Alive Configuration

To prevent free tiers from pausing:

1. **Cloudflare Worker Cron (Primary)**:
   - `30 18 * * *` updates expired members at 00:00 Asia/Kolkata.
   - `30 3 * * *` sends SMS reminders at 09:00 Asia/Kolkata.
   - `*/10 * * * *` pings Supabase to prevent inactivity sleep.
2. **UptimeRobot (Optional Worker Health Monitor)**:
   - Create a free account on [uptimerobot.com](https://uptimerobot.com).
   - Add a monitor → HTTP(s) → URL: `https://fitness-world-gymos-api.your-subdomain.workers.dev/health`.
   - Set interval to **5 minutes** with email alerts.
3. **GitHub Actions (Optional Supabase Backup Keep-Alive)**:
   - Save `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repository secrets.
   - The workflow in `.github/workflows/keep-supabase-alive.yml` will trigger every 5 days to query the database and keep the instance warm.
