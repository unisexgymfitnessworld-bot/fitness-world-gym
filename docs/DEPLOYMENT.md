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
   - `202606160001_audit_hardening.sql` (audit hardening)
   - `202606170001_renewal_arrears.sql` (renewal arrears carry-forward)
   - `202606180001_create_sms_logs.sql` (SMS outbox + delivery history — required for auto-retry)
   - `202606190001_add_balance_overdue_sms_kind.sql` (balance-nudge kind)
   - `202606200001_add_members_avatar_column.sql` (member photos)
   - `202606210001_revoke_members_anon_access.sql` (closes anon SELECT — backend only)
   - `202606220001_add_members_email.sql` (email channel)
   - `202606230001_member_purge_and_wipe.sql` (purge + wipe functions)
   - `202606240001_money_idempotency_keys.sql` (receipt/renew dedupe indexes)
   - `202606250001_renewal_old_amount.sql` (history stats truth)
   - `202606260001_money_buckets.sql` (arrears/advance/lifetime cash + backfill)
   - `202606270001_statement_kind_and_member_idempotency.sql` (statement kind + member keys)
   - `202606280001_wipe_owner_scope.sql` (wipe scoped to one owner)
   - `202606290001_renew_resume_columns.sql` (renew crash-resume columns)

   Shortcut for existing projects: paste `supabase/APPLY_MISSING_MIGRATIONS.sql` (idempotent, safe to re-run) instead. It covers everything above section 13 onward plus the early pieces older DBs may lack.
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
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_ANON_KEY
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put FRONTEND_URLS
   npx wrangler secret put TRAINER_EMAILS
   npx wrangler secret put SMSGATE_USERNAME
   npx wrangler secret put SMSGATE_PASSWORD
   npx wrangler secret put SMS_SECRET_KEY
   ```
   Set `SUPABASE_URL` to your own project URL (the backend refuses to boot
   without it — never point a fresh deploy at another project's database).
   Set `SMS_SECRET_KEY` BEFORE saving any SMS/WhatsApp/email password in the
   app: saving settings without it is rejected so secrets never land in
   plaintext.
   Set `FRONTEND_URLS` to a comma-separated list, for example:
   ```text
   http://localhost:5173,http://127.0.0.1:5173,https://your-app.vercel.app
   ```
   Set `TRAINER_EMAILS` to the exact trainer allowlist (REQUIRED — there is no
   fallback list; an empty value locks everyone out):
   ```text
   digimartrix26@gmail.com,vijayfitnessworld@gmail.com,jaiga9655@gmail.com
   ```
   To change who can log in, edit this secret — never the code. The developer
   account additionally needs `app_metadata` `{"role": "developer"}` (step 6
   below). Developer accounts see the system health console only; trainer
   accounts share the gym workspace.
3. **Shared rate limiting (recommended)**: abuse buckets are per-server without
   it. Create one KV namespace and bind it:
   ```bash
   npx wrangler kv namespace create RATE_LIMIT_KV
   ```
   Then add its id to `workers/gymos-api/wrangler.jsonc`:
   ```jsonc
   "kv_namespaces": [{ "binding": "RATE_LIMIT_KV", "id": "<namespace-id>" }]
   ```
   Redeploy. Without the binding the worker falls back to per-server buckets
   (fine for 3 trainers, weaker against a real attack).
4. **Deploy Worker**:
   ```bash
   npx wrangler deploy
   ```
5. **Verify Health**:
   Open `https://fitness-world-gymos-api.your-subdomain.workers.dev/health`.
6. **Create the first developer account**:
   Create it in Supabase Dashboard → **Authentication** → **Users** → **Add user** (auto-confirm email), then set its `app_metadata` to `{"role": "developer"}` via the user editor. Sign in with it and create the remaining trainer accounts from the developer console → Account Manager. Use unique passwords with at least 12 characters. Note: every login email must ALSO be listed in `TRAINER_EMAILS` — console-created accounts without an allowlist entry cannot sign in.

### Phase C: Frontend Setup on Vercel

0. **Repo prerequisite**: this project folder is not a git repo yet. Run
   `git init`, commit, create the GitHub repo, and push — Vercel and the
   keep-alive workflow both need the GitHub repo to exist first.
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
provider: the phone must stay on and online for same-minute delivery.

The 09:00 IST job runs four sweeps: members due in 1–3 days (each reminded once,
with catch-up if a day was missed), members due today (including plans the
midnight job just expired for non-payment), a one-time win-back for members
expired 15–30 days ago, and a balance nudge for members expired exactly 2 days
ago who still owe money. Members expired more than 30 days ago are never
messaged automatically.

Balance reminders ride the same rhythm: if a swept member owes money (half-paid
or unpaid), the 3-day and due-day texts include the pending Rs. amount instead
of the plain renewal text — still one SMS per touchpoint. All four sweeps cover
all plan lengths, including short (<30 day) plans: short-plan dues, Due Soon,
follow-ups, reports, and the manual SMS button no longer exclude them.

1. **Install the SMSGate app** on the gym phone from the project's Releases page and grant SMS permissions.
2. **Register a cloud account** inside the app (needed so the Worker API can reach the phone over the internet).
3. **Enter the credentials** in GymOS → Settings (gear icon) → SMS Setup tab (trainers and developers both can do this): username, password, optional device ID / SIM number. Save, then use the built-in test box to send yourself a test message.
4. **Keep the phone on, online, and plugged in** at the gym desk on a recharge that includes SMS (most unlimited packs include 100 SMS/day). Turn off battery optimization for the SMS Gateway app so Android does not kill it.

### 3.1 Delivery reliability (how missed messages are prevented)

- **Retry with backoff**: every send retries transient failures (network, timeout, throttling, SMSGate 5xx) automatically, honoring `Retry-After`.
- **No double-sends**: each message carries a stable SMSGate id, and any timeout is verified against SMSGate (`GET /messages/{id}`) before a re-post. Manual sends also carry an idempotency key, so double-taps and network retries dedup.
- **Persistent outbox**: every attempt is logged to `sms_logs` (`queued` → `sent` → `delivered`, or `failed`). Anything still unsent is retried by the sweep below for up to ~2 days with growing delays (5 min → 24 h).
- **Retry sweep**: runs on every worker tick, throttled to ~15 min. It verifies unknown outcomes, re-posts what SMSGate never saw, and refreshes delivery states. Runs even when the DB keep-alive toggle is off.
- **Live health**: Settings → Notifications → *Live Delivery Health* shows cloud reachability, login validity, gym phone last-seen age, WhatsApp/Email status, queue depth, and the last 9 AM run stats — without sending anything. The developer console mirrors queue/failed counts.
- **Recent Messages**: the last 10 sends with per-channel status and a *Retry now* button for queued/failed rows. Never resends an already-confirmed message (it refreshes delivery state instead).

### 3.2 WhatsApp Setup (OpenWA, self-hosted)

GymOS talks to [OpenWA](https://github.com/rmyndharis/OpenWA) (free, MIT, Docker). Unlike SMSGate it does NOT run on the gym phone — it needs a small always-on server (cheapest VPS, Railway/Render, or a gym PC with Docker and a public URL the worker can reach).

1. Deploy OpenWA per its README (Docker). Note its public base URL (e.g. `https://wa.yourserver.com`).
2. In the OpenWA dashboard: create a session (e.g. `gym`), start it, scan the QR with the gym's WhatsApp number. Create an **operator** API key.
3. In GymOS → Settings → Notifications → WhatsApp: paste base URL, API key, session id. Save, then send a test from the test box (channel: WhatsApp).
4. Honest risks: OpenWA drives WhatsApp Web sessions (unofficial automation, same family as the old Baileys gateway). Use a **dedicated gym number**, keep volumes low (reminders only), and never spam — aggressive or bulk sends can get the number restricted by WhatsApp.

### 3.3 Email Setup (Apps Script mailer)

1. Open [script.google.com](https://script.google.com) → New project → paste `appsscript/Code.gs` → set `SECRET` to a long random string.
2. Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone → Deploy → copy the `/exec` URL.
3. In GymOS → Settings → Notifications → Email: paste the URL and the same secret. Save, then send a test (channel: Email).
4. Members need an email address on their profile (add/edit member form) to receive emails. Gmail free accounts send ~100–500/day — plenty for gym reminders.

### 3.4 Smart Channel Order

Automatic reminders try channels in the saved order (default WhatsApp → SMS → Email) and stop at the first one that accepts the message — a member is never double-messaged. A channel is skipped for the rest of a run only when it fails auth/config for one member. Manual sends pick Auto (same order) or one fixed channel in the message box. Every attempt is logged per channel in Recent Messages with retry.

---

## 4. Upgrading From the Old WhatsApp Build

- The old WhatsApp setup (Render Baileys gateway, UltraMsg, Twilio) is gone. WhatsApp is back via self-hosted OpenWA (section 3.2) — free, but you host it.
- Runtime settings moved from the `whatsapp_sessions` table to the `system_settings` table. After deploying, **re-enter credentials once** in Settings → Notifications (open to trainers and developers), then send a test from the built-in test box.
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

---

## 6. Fresh Start (erase all gym data)

To wipe test data and start clean: Settings → **Data** tab → export a backup first (Reports → Backup), tick the backup checkbox, type `ERASE ALL`. This deletes every member, receipt, renewal, visit, and message log in one atomic step and restarts member numbers from FW-001. Settings, notification credentials, and logins are untouched. Single members are erased from their profile instead: Delete, then **Delete forever** (purge needs the soft-delete first, so it can never be a one-tap accident).

Developer SQL equivalent (Supabase SQL Editor): `select public.wipe_all_gym_data();` — requires section 9+ of `APPLY_MISSING_MIGRATIONS.sql`.
