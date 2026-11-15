# GitHub Actions Setup

1. Open the GitHub repository.
2. Go to **Settings** → **Secrets and variables** → **Actions**.
3. Add `SUPABASE_URL`.
4. Add `SUPABASE_ANON_KEY`.
5. Open **Actions** → **Keep Supabase Alive**.
6. Run the workflow manually once with **workflow_dispatch**.
7. Confirm the run succeeds.

The scheduled workflow runs every 5 days at 8:00 AM UTC and sends a lightweight REST request to Supabase. This is now an optional fallback because the Cloudflare Worker cron jobs also touch Supabase daily.
