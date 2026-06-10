import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  Browsers,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import express from "express";
import QRCode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GATEWAY_TOKEN =
  process.env.GATEWAY_TOKEN || "fitness-world-secret-token-2026";

let sock = null;
let qrCodeData = null;
let connectionStatus = "connecting"; // 'connecting', 'qr_ready', 'connected', 'disconnected'
let qrRetries = 0;
const MAX_QR_RETRIES = 5;

// Ensure auth directory exists
const AUTH_DIR = path.join(__dirname, "auth_info");
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function clearAuthDir() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      console.log("[gateway] Auth directory cleared for fresh login.");
    }
  } catch (err) {
    console.error("[gateway] Failed to clear auth directory:", err);
  }
}

async function startWhatsApp() {
  connectionStatus = "connecting";
  qrCodeData = null;
  qrRetries = 0;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  // Always dynamically fetch the latest WhatsApp Web version for compatibility
  let version;
  try {
    const { version: latestVersion, isLatest } =
      await fetchLatestWaWebVersion({});
    console.log(
      `[gateway] Using WA Web version: ${latestVersion.join(".")}, isLatest: ${isLatest}`
    );
    version = latestVersion;
  } catch (err) {
    console.warn(
      "[gateway] Failed to fetch latest WA Web version, using library default:",
      err.message
    );
    // Let Baileys use its built-in default version if fetch fails
    version = undefined;
  }

  const socketConfig = {
    auth: state,
    printQRInTerminal: true,
    browser: Browsers.macOS("Chrome"),
  };

  // Only include version if we successfully fetched it
  if (version) {
    socketConfig.version = version;
  }

  sock = makeWASocket(socketConfig);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrRetries++;
      if (qrRetries > MAX_QR_RETRIES) {
        console.log(
          `[gateway] QR code expired ${MAX_QR_RETRIES} times. Clearing auth and restarting...`
        );
        sock?.end(undefined);
        sock = null;
        clearAuthDir();
        setTimeout(startWhatsApp, 3000);
        return;
      }
      connectionStatus = "qr_ready";
      qrCodeData = qr;
      console.log(
        `[gateway] QR code generated (attempt ${qrRetries}/${MAX_QR_RETRIES}). Scan with WhatsApp.`
      );
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode
          : undefined;

      const reason = statusCode ?? "unknown";
      console.log(
        `[gateway] Connection closed. Reason: ${reason}`,
        lastDisconnect?.error?.message ?? ""
      );

      connectionStatus = "disconnected";
      qrCodeData = null;

      switch (statusCode) {
        case DisconnectReason.loggedOut:
          // Logged out — clean up and force fresh QR scan
          console.log(
            "[gateway] Logged out from WhatsApp. Clearing session for fresh scan..."
          );
          clearAuthDir();
          setTimeout(startWhatsApp, 3000);
          break;

        case DisconnectReason.restartRequired:
          // Restart required — reconnect immediately
          console.log("[gateway] Restart required. Reconnecting immediately...");
          setTimeout(startWhatsApp, 1000);
          break;

        case DisconnectReason.connectionLost:
        case DisconnectReason.timedOut:
          // Network issues — retry with delay
          console.log("[gateway] Connection lost/timed out. Retrying in 5s...");
          setTimeout(startWhatsApp, 5000);
          break;

        case DisconnectReason.badSession:
          // Bad session — clean up auth and restart
          console.log("[gateway] Bad session detected. Clearing auth...");
          clearAuthDir();
          setTimeout(startWhatsApp, 3000);
          break;

        case DisconnectReason.connectionReplaced:
          // Another device connected — do not reconnect automatically
          console.log(
            "[gateway] Connection replaced by another device. Stopping."
          );
          break;

        case 401:
          // Unauthorized — session invalid, clean up and restart
          console.log("[gateway] 401 Unauthorized. Clearing session...");
          clearAuthDir();
          setTimeout(startWhatsApp, 3000);
          break;

        case 405:
          // Method not allowed — version mismatch, clean up and restart
          console.log(
            "[gateway] 405 Protocol mismatch. Clearing auth and retrying..."
          );
          clearAuthDir();
          setTimeout(startWhatsApp, 5000);
          break;

        default:
          // Unknown error — attempt reconnect with back-off
          console.log(
            `[gateway] Unknown disconnect (code: ${reason}). Retrying in 5s...`
          );
          setTimeout(startWhatsApp, 5000);
          break;
      }
    } else if (connection === "open") {
      console.log("[gateway] ✅ WhatsApp connection successfully opened!");
      connectionStatus = "connected";
      qrCodeData = null;
      qrRetries = 0;
    }
  });
}

// Start the client
startWhatsApp().catch((err) => {
  console.error("[gateway] Failed to start WhatsApp client:", err);
  // Clean auth and retry on startup failure
  clearAuthDir();
  setTimeout(startWhatsApp, 5000);
});

// Middleware to verify authorization token
function verifyToken(req, res, next) {
  const authHeader =
    req.headers["authorization"] || req.headers["x-gateway-token"];
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : null;

  if (!token || token !== GATEWAY_TOKEN) {
    return res
      .status(401)
      .json({ success: false, error: "Unauthorized: Invalid or missing token" });
  }
  next();
}

// UI page showing status or QR code
app.get("/", async (req, res) => {
  res.setHeader("Content-Type", "text/html");

  if (connectionStatus === "connected") {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GymOS WhatsApp Gateway</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #121214; color: #e1e1e6; text-align: center; padding: 50px 20px; }
            .card { background: #202024; border-radius: 12px; padding: 30px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 1px solid #323238; }
            .status-badge { background: #04d361; color: #121214; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Fitness World GymOS</h1>
            <p>WhatsApp Gateway Service</p>
            <div class="status-badge">🟢 Connected & Active</div>
            <p style="color: #a8a8b3;">Your gym phone is successfully linked. You can close this tab now.</p>
          </div>
        </body>
      </html>
    `);
  }

  if (connectionStatus === "qr_ready" && qrCodeData) {
    try {
      const qrImageBase64 = await QRCode.toDataURL(qrCodeData);
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Link GymOS WhatsApp</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="refresh" content="10"> <!-- Autorefreshes page to load fresh QR if it rotates -->
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #121214; color: #e1e1e6; text-align: center; padding: 50px 20px; }
              .card { background: #202024; border-radius: 12px; padding: 30px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 1px solid #323238; }
              img { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; }
              .retry-info { color: #8257e5; font-size: 11px; margin-top: 10px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Link GymOS WhatsApp</h1>
              <p>Scan this QR code with your gym's WhatsApp application:</p>
              <img src="${qrImageBase64}" alt="WhatsApp QR Code" />
              <p style="color: #a8a8b3; font-size: 13px;">Open WhatsApp > Settings > Linked Devices > Link a Device.</p>
              <p class="retry-info">QR attempt ${qrRetries}/${MAX_QR_RETRIES} — This page refreshes automatically every 10 seconds.</p>
            </div>
          </body>
        </html>
      `);
    } catch (err) {
      return res.status(500).send("Error generating QR code image");
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Starting WhatsApp Gateway...</title>
        <meta http-equiv="refresh" content="3">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #121214; color: #e1e1e6; text-align: center; padding: 50px; }
          .spinner { display: inline-block; width: 40px; height: 40px; border: 4px solid #323238; border-top: 4px solid #8257e5; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px; }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h1>Initializing Gateway Service...</h1>
        <p>Connecting to WhatsApp servers. Please wait...</p>
        <p style="color: #8257e5; font-size: 12px;">Status: ${connectionStatus}</p>
      </body>
    </html>
  `);
});

// JSON Status endpoint
app.get("/status", (req, res) => {
  res.json({
    success: true,
    status: connectionStatus,
    qrReady: !!qrCodeData,
    qrRetries,
  });
});

// Force re-scan endpoint (clears auth and restarts)
app.post("/reset", verifyToken, async (req, res) => {
  console.log("[gateway] Reset requested. Clearing auth and restarting...");
  try {
    if (sock) {
      sock.end(undefined);
      sock = null;
    }
    clearAuthDir();
    setTimeout(startWhatsApp, 1000);
    res.json({ success: true, message: "Gateway reset. Scan the new QR code." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Message sending API
app.post("/send", verifyToken, async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({
      success: false,
      error: "Missing phone number (to) or message content",
    });
  }

  if (connectionStatus !== "connected" || !sock) {
    return res.status(503).json({
      success: false,
      error: "WhatsApp gateway is not connected. Please scan the QR code first.",
    });
  }

  try {
    // Format recipient phone number (remove any leading '+', parse and append @s.whatsapp.net)
    const cleanPhone = to.replace(/[^\d]/g, "");
    const jid = `${cleanPhone}@s.whatsapp.net`;

    const result = await sock.sendMessage(jid, { text: message });
    res.json({ success: true, messageId: result.key.id });
  } catch (err) {
    console.error("[gateway] Failed to send WhatsApp message:", err);
    res
      .status(500)
      .json({ success: false, error: err.message || "Failed to send message" });
  }
});

app.listen(PORT, () => {
  console.log(`[gateway] WhatsApp Gateway Service listening on port ${PORT}`);
});
