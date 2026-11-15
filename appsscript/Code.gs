/**
 * Fitness World GymOS email mailer.
 *
 * Deploy: Extensions → Apps Script → paste this file → set the SECRET below →
 * Deploy → New deployment → Web app → Execute as: Me → Who has access:
 * Anyone → copy the /exec URL into GymOS Settings → Notifications → Email.
 * After editing: Deploy → Manage deployments → pencil → New version → Deploy.
 *
 * Contract with the GymOS worker:
 *   POST {secret, to, subject, text, key, html?, pdfName?}
 *     → {ok: true} | {ok: true, duplicate: true} | {ok: false, error}
 *   GET  ?ping=1 → {ok: true, mailer: "gymos"}
 *
 * `html` (optional): pretty receipt body + PDF attachment named `pdfName`.
 * `key` dedupes retries for a full 24h via script properties (CacheService
 * alone only holds ~6h, shorter than the worker's retry horizon).
 */

// Must match the secret saved in GymOS Settings → Notifications.
var SECRET = "CHANGE-ME-TO-A-LONG-RANDOM-STRING";
var DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

function doGet(e) {
  if (e && e.parameter && e.parameter.ping) {
    return json({ ok: true, mailer: "gymos" });
  }
  return json({ ok: false, error: "Use POST" });
}

function isDuplicate(key) {
  if (!key) {
    return false;
  }
  var cache = CacheService.getScriptCache();
  if (cache.get("sent:" + key)) {
    return true;
  }
  try {
    var props = PropertiesService.getScriptProperties();
    var at = Number(props.getProperty("sent:" + key) || 0);
    if (at && Date.now() - at < DEDUPE_WINDOW_MS) {
      cache.put("sent:" + key, "1", 6 * 60 * 60);
      return true;
    }
  } catch (err) {
    // Properties unavailable: fall through to the send (cache still guards
    // the common fast-retry case).
  }
  return false;
}

function markSent(key) {
  if (!key) {
    return;
  }
  try {
    CacheService.getScriptCache().put("sent:" + key, "1", 6 * 60 * 60);
  } catch (err) {}
  try {
    PropertiesService.getScriptProperties().setProperty("sent:" + key, String(Date.now()));
  } catch (err) {}
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.secret !== SECRET) {
      return json({ ok: false, error: "Invalid secret" });
    }
    var to = String(body.to || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return json({ ok: false, error: "Invalid recipient email" });
    }
    var text = String(body.text || "");
    if (!text) {
      return json({ ok: false, error: "Empty message" });
    }
    var key = String(body.key || "");
    if (isDuplicate(key)) {
      return json({ ok: true, duplicate: true });
    }
    var subject = String(body.subject || "Message from Fitness World");
    var html = String(body.html || "");
    var options = {};
    if (html) {
      options.htmlBody = html;
      try {
        var pdfName = String(body.pdfName || "Receipt.pdf").replace(/[^\w.\-() ]+/g, "_");
        var blob = HtmlService.createHtmlOutput(html).getBlob().getAs("application/pdf").setName(pdfName);
        options.attachments = [blob];
      } catch (err) {
        // PDF failed: the email still goes out with text + html body.
      }
    }
    GmailApp.sendEmail(to, subject, text, options);
    markSent(key);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
