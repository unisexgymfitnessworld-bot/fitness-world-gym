# UptimeRobot Setup

1. Create a free account at https://uptimerobot.com.
2. Select **Add Monitor**.
3. Choose **HTTP(s)**.
4. Set the URL to `https://fitness-world-gymos-api.your-subdomain.workers.dev/health`.
5. Set the interval to **5 minutes**.
6. Enable email alerts.
7. Save the monitor.

The Worker `GET /health` endpoint returns `200` with a JSON status payload and lightly touches Supabase. Cloudflare Workers do not need wake-up pings, so this monitor is mainly for alerts and an extra Supabase keep-alive.
