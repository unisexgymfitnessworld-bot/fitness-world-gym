# UptimeRobot Setup

1. Create a free account at https://uptimerobot.com.
2. Select **Add Monitor**.
3. Choose **HTTP(s)**.
4. Set the URL to `https://your-app.koyeb.app/health`.
5. Set the interval to **5 minutes**.
6. Enable email alerts.
7. Save the monitor.

The backend `GET /health` endpoint always returns `200` with a JSON status payload, so UptimeRobot can keep the Koyeb service warm and alert you if it becomes unreachable.
