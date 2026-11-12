# GymOS — Free Self-Hosted WhatsApp Gateway

This is a lightweight, free-tier compatible WhatsApp gateway built using `@whiskeysockets/baileys` v7. It connects directly to WhatsApp Web's WebSocket protocol without spawning a heavy Chromium instance (meaning it uses less than 50MB RAM and never crashes on free plans).

---

## 🚀 How to Deploy to Render (100% Free)

1. Sign up/Login to **[Render.com](https://render.com/)**.
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository.
4. Set the following options:
   * **Name**: `gymos-whatsapp-gateway`
   * **Root Directory**: `whatsapp-gateway`
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
   * **Instance Type**: **Free**
5. Add the following **Environment Variables** under the Advanced section:
   * `GATEWAY_TOKEN`: Create a secure secret token (e.g., `FW-WhatsApp-Secure-Key-2026`). This protects your gateway so only your GymOS application can send messages.
6. Click **Deploy Web Service**.

---

## 📲 How to Link Your Gym Phone

1. Once Render finishes deploying, open the Render URL in your browser:
   `https://gymos-whatsapp-gateway.onrender.com`
2. You will see a **QR Code** on the screen.
3. Open WhatsApp on your gym's mobile phone:
   * Go to **Settings** -> **Linked Devices** -> **Link a Device**.
4. Scan the QR code shown in the browser.
5. The page will reload and show: **🟢 Connected & Active**. You are now ready!

### 🔄 Troubleshooting Connection Failures

If scanning the QR code says "Connection failed":
- **Wait 10 seconds** — the page auto-refreshes with a new QR code.
- If it keeps failing after 5 attempts, the gateway will **automatically reset** and generate a fresh QR.
- You can also manually force a reset by sending a POST request to `/reset` with your gateway token.
- Make sure you are scanning from the **same WhatsApp account** that was previously linked. If you changed phones, the old session is invalid and the gateway will auto-clear it.

---

## ⚡ How to Connect it to GymOS Cloudflare Worker

To make your main GymOS Cloudflare Worker send alerts through this free gateway, add these three secrets to your Worker:

1. **`WHATSAPP_GATEWAY_URL`**: Set this to your deployed Render URL (without trailing slash):
   `https://gymos-whatsapp-gateway.onrender.com`
2. **`WHATSAPP_GATEWAY_TOKEN`**: Set this to the exact `GATEWAY_TOKEN` you set in Step 5 on Render.
3. **`WHATSAPP_INSTANCE_ID`**: Set this to `"self_hosted"` to signal the worker to use your new free gateway instead of UltraMsg!

Run these commands in the terminal:
```bash
npx wrangler secret put WHATSAPP_GATEWAY_URL
# (Enter: https://gymos-whatsapp-gateway.onrender.com)

npx wrangler secret put WHATSAPP_GATEWAY_TOKEN
# (Enter the GATEWAY_TOKEN value)

npx wrangler secret put WHATSAPP_INSTANCE_ID
# (Enter: self_hosted)
```

---

## 📡 API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/` | GET | No | Shows QR code or connection status page |
| `/status` | GET | No | Returns JSON with current connection status |
| `/send` | POST | Bearer Token | Sends a WhatsApp message |
| `/reset` | POST | Bearer Token | Force-clears session and generates new QR |
