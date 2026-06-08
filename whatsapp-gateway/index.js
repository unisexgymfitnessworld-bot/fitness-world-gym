const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || 'fitness-world-secret-token-2026';

let sock = null;
let qrCodeData = null;
let connectionStatus = 'connecting'; // 'connecting', 'qr_ready', 'connected', 'disconnected'

// Ensure auth directory exists
const AUTH_DIR = path.join(__dirname, 'auth_info');
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'qr_ready';
      qrCodeData = qr;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;

      console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting: ', shouldReconnect);
      connectionStatus = 'disconnected';
      qrCodeData = null;

      if (shouldReconnect) {
        // Delay reconnect to avoid loop
        setTimeout(startWhatsApp, 5000);
      } else {
        console.log('Logged out from WhatsApp. Please clear auth_info folder and scan again.');
        // Clean up credentials folder
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        setTimeout(startWhatsApp, 5000);
      }
    } else if (connection === 'open') {
      console.log('WhatsApp connection successfully opened!');
      connectionStatus = 'connected';
      qrCodeData = null;
    }
  });
}

// Start the client
startWhatsApp().catch((err) => console.error('Failed to start WhatsApp client:', err));

// Middleware to verify authorization token
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-gateway-token'];
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;

  if (!token || token !== GATEWAY_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing token' });
  }
  next();
}

// UI page showing status or QR code
app.get('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/html');

  if (connectionStatus === 'connected') {
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

  if (connectionStatus === 'qr_ready' && qrCodeData) {
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
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Link GymOS WhatsApp</h1>
              <p>Scan this QR code with your gym's WhatsApp application:</p>
              <img src="${qrImageBase64}" alt="WhatsApp QR Code" />
              <p style="color: #a8a8b3; font-size: 13px;">Open WhatsApp > Settings > Linked Devices > Link a Device.</p>
              <p style="color: #8257e5; font-size: 11px;">This page refreshes automatically every 10 seconds.</p>
            </div>
          </body>
        </html>
      `);
    } catch (err) {
      return res.status(500).send('Error generating QR code image');
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
        </style>
      </head>
      <body>
        <h1>Initializing Gateway Service...</h1>
        <p>Connecting to WhatsApp servers. Please wait...</p>
      </body>
    </html>
  `);
});

// JSON Status endpoint
app.get('/status', (req, res) => {
  res.json({
    success: true,
    status: connectionStatus,
    qrReady: !!qrCodeData
  });
});

// Message sending API
app.post('/send', verifyToken, async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ success: false, error: 'Missing phone number (to) or message content' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(503).json({ success: false, error: 'WhatsApp gateway is not connected' });
  }

  try {
    // Format recipient phone number (remove any leading '+', parse and append @s.whatsapp.net)
    const cleanPhone = to.replace(/[^\d]/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;

    const result = await sock.sendMessage(jid, { text: message });
    res.json({ success: true, messageId: result.key.id });
  } catch (err) {
    console.error('Failed to send WhatsApp message:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to send message' });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp Gateway Service listening on port ${PORT}`);
});
