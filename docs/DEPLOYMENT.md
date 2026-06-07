# Fitness World GymOS — Production Deployment Checklist & Handbook

This document lists the step-by-step production checklist and handover procedures for the **Fitness World GymOS** application.

---

## 1. Production URL Checklist

Update these placeholders once the production environments are provisioned:

- **Frontend URL (Vercel)**: `https://fitness-world.vercel.app` (or custom domain)
- **Backend URL (Koyeb)**: `https://fitness-world-backend.koyeb.app`
- **Database Dashboard (Supabase)**: `https://supabase.com/dashboard/project/your-project-id`

---

## 2. Step-by-Step Deployment Steps

### Phase A: Supabase Setup (Database & Auth)
1. **Create Project**: Sign in to [supabase.com](https://supabase.com) and create a new project.
2. **Execute Migrations**: Run the SQL script from `supabase/migrations/202606070001_create_fitness_world_schema.sql` in the Supabase SQL Editor to configure tables, indexes, triggers, and RLS policies.
3. **Copy Secrets**: Retrieve the following from **Settings** → **API**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Keep secure)

### Phase B: Backend Setup on Koyeb (Node.js REST API)
1. **Connect Repository**: Import the repository on [koyeb.com](https://koyeb.com).
2. **Configure App settings**:
   - Service Root: `/backend`
   - Builder: `Node.js`
   - Command override: `npm run start`
3. **Define Environment Variables**:
   - `PORT=8080` (Koyeb default)
   - `NODE_ENV=production`
   - `SUPABASE_URL=https://your-project.supabase.co`
   - `SUPABASE_ANON_KEY=your-anon-key`
   - `SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`
   - `FAST2SMS_API_KEY=your-client-fast2sms-api-key`
   - `FRONTEND_URL=https://your-app.vercel.app`
4. **Seed Trainer Accounts**:
   Once deployed, run the seed script locally or as a one-off task on Koyeb:
   ```bash
   SUPABASE_URL="your-url" SUPABASE_SERVICE_ROLE_KEY="your-key" npm run seed:trainers
   ```
   *Note: This creates the following accounts in Supabase Auth:*
   - `trainer@fitnessworld.in` (Password: `trainer123`)
   - `trainer1@fitnessworld.in` (Password: `trainer123`)
   - `trainer2@fitnessworld.in` (Password: `trainer123`)

### Phase C: Frontend Setup on Vercel
1. **Connect Repo**: Import the repository on [vercel.com](https://vercel.com).
2. **Configure App settings**:
   - Framework Preset: `Vite`
   - Root Directory: `frontend`
3. **Define Environment Variables**:
   - `VITE_SUPABASE_URL=https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=your-anon-key`
   - `VITE_API_BASE_URL=https://your-app.koyeb.app/api`
4. **Deploy**: Build and verify.

---

## 3. Keep-Alive Configuration

To prevent free tiers from pausing:
1. **UptimeRobot (Koyeb Backend)**:
   - Create a free account on [uptimerobot.com](https://uptimerobot.com).
   - Add a monitor → HTTP(s) → URL: `https://your-app.koyeb.app/health`.
   - Set interval to **5 minutes** with email alerts.
2. **GitHub Actions (Supabase Postgres)**:
   - Save `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repository secrets.
   - The workflow in `.github/workflows/keep-supabase-alive.yml` will trigger every 5 days to query the database and keep the instance warm.

---

## 4. SMS Management & Fast2SMS Recharge

The system uses **Fast2SMS** for automated dues alerts.
- **Cost**: ~₹0.25 per SMS.
- **Low Balance Indicator**: If the wallet balance falls to zero, automated alerts will fail. Check logs inside Koyeb for `FAST2SMS_FAILED` errors.
- **Recharge Instructions**:
  1. Login to the client account at [fast2sms.com](https://fast2sms.com).
  2. Navigate to the **Wallet / Add Credits** section.
  3. Load a minimum of ₹100 using UPI/Card.
  4. Ensure the API key remains the same. If regenerated, update the `FAST2SMS_API_KEY` on Koyeb and redeploy.
