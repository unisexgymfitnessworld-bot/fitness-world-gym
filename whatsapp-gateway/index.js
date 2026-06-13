import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  Browsers,
  initAuthCreds,
  BufferJSON,
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useDbSession = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

if (useDbSession) {
  console.log("[gateway] 🗄️ Supabase credentials detected. Session will be saved to Supabase.");
} else {
  console.log("[gateway] 📂 No Supabase configuration found. Defaulting to local filesystem.");
}

async function getSessionFromDb(key) {
  if (!useDbSession) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/whatsapp_sessions?key=eq.${encodeURIComponent(key)}&select=value`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      }
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`REST error: ${response.statusText}`);
    }
    const rows = await response.json();
    return rows[0]?.value ?? null;
  } catch (err) {
    console.error(`[gateway] Error fetching session key "${key}":`, err.message);
    return null;
  }
}

async function saveSessionToDb(key, value) {
  if (!useDbSession) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/whatsapp_sessions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({ key, value })
    });
    if (!response.ok) {
      throw new Error(`REST error: ${response.statusText}`);
    }
  } catch (err) {
    console.error(`[gateway] Error saving session key "${key}":`, err.message);
  }
}

async function deleteSessionFromDb(key) {
  if (!useDbSession) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/whatsapp_sessions?key=eq.${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`REST error: ${response.statusText}`);
    }
  } catch (err) {
    console.error(`[gateway] Error deleting session key "${key}":`, err.message);
  }
}

async function clearDbSession() {
  if (!useDbSession) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/whatsapp_sessions?key=neq.system_config_settings`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`REST error: ${response.statusText}`);
    }
    console.log("[gateway] Database session cleared.");
  } catch (err) {
    console.error("[gateway] Error clearing database session:", err.message);
  }
}

async function useSupabaseAuthState() {
  let creds = await getSessionFromDb("creds");
  if (creds) {
    creds = JSON.parse(JSON.stringify(creds), BufferJSON.reviver);
  } else {
    creds = initAuthCreds();
    await saveSessionToDb("creds", JSON.parse(JSON.stringify(creds, BufferJSON.replacer)));
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await getSessionFromDb(`${type}-${id}`);
              if (value) {
                value = JSON.parse(JSON.stringify(value), BufferJSON.reviver);
                data[id] = value;
              }
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                const serializedValue = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
                tasks.push(saveSessionToDb(key, serializedValue));
              } else {
                tasks.push(deleteSessionFromDb(key));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: async () => {
      const serializedCreds = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
      await saveSessionToDb("creds", serializedCreds);
    }
  };
}

function clearAuthDir() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      console.log("[gateway] Auth directory cleared for fresh login.");
    }
    if (useDbSession) {
      clearDbSession();
    }
  } catch (err) {
    console.error("[gateway] Failed to clear auth directory:", err);
  }
}

async function startWhatsApp() {
  connectionStatus = "connecting";
  qrCodeData = null;
  qrRetries = 0;

  const { state, saveCreds } = useDbSession
    ? await useSupabaseAuthState()
    : await useMultiFileAuthState(AUTH_DIR);

  // Always dynamically fetch the latest WhatsApp Web version for compatibility (with a 5s timeout)
  let version;
  try {
    const versionPromise = fetchLatestWaWebVersion({});
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 5000)
    );
    const { version: latestVersion, isLatest } = await Promise.race([
      versionPromise,
      timeoutPromise,
    ]);
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
        if (sock) {
          try {
            sock.ev.removeAllListeners();
          } catch (e) {}
          try {
            sock.end(undefined);
          } catch (e) {}
          sock = null;
        }
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
      try {
        sock.ev.removeAllListeners();
      } catch (e) {}
      try {
        sock.end(undefined);
      } catch (e) {}
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
