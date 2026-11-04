// KhataNova secure scan endpoint.
// Existing SCAN_SECRET + GEMINI_API_KEY / ANTHROPIC_API_KEY environment variables remain supported.
const crypto = require('crypto');
const MODEL = process.env.SCAN_MODEL || 'claude-sonnet-5-5';
const MAX_IMAGE_CHARS = 10 * 1024 * 1024; // ~7.5 MB decoded image
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 12;
// Best-effort per serverless instance rate limit. Use Vercel Firewall/WAF for global enforcement.
const hits = new Map();

const PROMPT = `You are an expert at reading photos of handwritten ledger (khata) pages, usually Urdu with Urdu or English numerals. Read EVERY row on the page, top to bottom, without skipping any.

Typical columns (right to left): Tareekh (date), Tafseel (detail), Safha/Rate, Naam (debit = goods or amount given on credit), Jama (credit = payment received), Baqaya (running balance).
The title after "Khata baanam" (کھاتہ بنام) is the party name; copy it exactly as written.
Dates are often stacked: day over month over year (8 / 2 / 26 = 8 Feb 2026). Two-digit years are 20xx. A ditto mark or "//" means same as the row above. Rows without their own date use the date of the row above.
In the detail column a number with kg/mann/weight is the quantity and a nearby number such as 290 is the rate. Quantity x rate normally equals the Naam amount - use this to double-check your reading.
Each row's Baqaya should equal the previous Baqaya + Naam - Jama. Use this to double-check digits (0 vs 6, 1 vs 7, 4 vs 9) and fix misreads.
If the first row already has a balance larger than its own amount, the page started with a carried-forward balance: still return the first row exactly as written.

Return ONLY valid JSON (no markdown) in this exact shape:
{"party":"name from the page title or empty string","rows":[{"date":"YYYY-MM-DD or null","detail":"detail text, Roman Urdu if the original is Urdu","qty":number or null,"rate":number or null,"debit":number,"credit":number,"balance":number or null}]}
Rules: debit = Naam amount, credit = Jama amount, balance = Baqaya as written. Use 0 for an empty amount column. Never invent rows or numbers. If something is unreadable put "?" at the end of detail and use null/0.`;

async function readJson(r) {
  const t = await r.text();
  let j = {};
  try { j = t ? JSON.parse(t) : {}; } catch (_) {}
  if (!r.ok) {
    const e = new Error((j.error && j.error.message) || 'AI provider request failed');
    e.status = 502;
    throw e;
  }
  return j;
}
async function viaGemini(key, mime, data) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const r = await fetch(url, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 8000 }
      })
    });
    const j = await readJson(r);
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    return parts.map(p => p.text || '').join('');
  } finally { clearTimeout(timer); }
}
async function viaClaude(key, mime, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 8000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data } },
          { type: 'text', text: PROMPT }
        ] }]
      })
    });
    const j = await readJson(r);
    return (j.content || []).map(c => c.text || '').join('');
  } finally { clearTimeout(timer); }
}
function rateLimited(ip) {
  const now = Date.now();
  const prev = hits.get(ip) || [];
  const fresh = prev.filter(t => now - t < WINDOW_MS);
  if (fresh.length >= MAX_REQUESTS) { hits.set(ip, fresh); return true; }
  fresh.push(now); hits.set(ip, fresh);
  if (hits.size > 2000) {
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
  }
  return false;
}
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function cleanOutput(out) {
  if (!out || typeof out !== 'object' || !Array.isArray(out.rows) || out.rows.length > 500) return null;
  const party = typeof out.party === 'string' ? out.party.slice(0, 200) : '';
  const rows = out.rows.map(r => {
    r = r && typeof r === 'object' ? r : {};
    const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
    return {
      date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
      detail: typeof r.detail === 'string' ? r.detail.slice(0, 500) : '',
      qty: num(r.qty), rate: num(r.rate),
      debit: num(r.debit) === null ? 0 : num(r.debit),
      credit: num(r.credit) === null ? 0 : num(r.credit),
      balance: num(r.balance)
    };
  });
  return { party, rows };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'unknown').slice(0, 80);
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many scan requests. Please wait 10 minutes and try again.' });

  const gk = process.env.GEMINI_API_KEY;
  const serverAnthropicKey = process.env.ANTHROPIC_API_KEY;
  // Preserve the existing app's optional personal Anthropic-key prompt.
  const userAnthropicKey = typeof req.headers['x-user-api-key'] === 'string' ? req.headers['x-user-api-key'].trim() : '';
  const ak = serverAnthropicKey || userAnthropicKey;
  if (!gk && !ak) return res.status(400).json({ code: 'nokey', error: 'No scan key is configured. Enter your existing Anthropic API key or configure a server key.' });

  const secret = process.env.SCAN_SECRET;
  if (secret && !sameSecret(req.headers['x-scan-key'], secret)) return res.status(401).json({ error: 'Wrong or missing scan key.' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      if (body.length > MAX_IMAGE_CHARS + 1000) return res.status(413).json({ error: 'Image is too large. Please choose a smaller photo.' });
      body = JSON.parse(body);
    }
    const image = body && body.image;
    if (typeof image !== 'string' || image.length > MAX_IMAGE_CHARS) {
      return res.status(image ? 413 : 400).json({ error: 'Image missing or too large. Please use an image under about 7 MB.' });
    }
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!m || m[2].length < 100) return res.status(400).json({ error: 'Please send a valid JPEG, PNG or WEBP image.' });
    const decoded = Buffer.from(m[2], 'base64');
    if (!decoded.length || decoded.length > 7 * 1024 * 1024) return res.status(413).json({ error: 'Image is too large. Please choose a smaller photo.' });

    const txt = gk ? await viaGemini(gk, m[1], m[2]) : await viaClaude(ak, m[1], m[2]);
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a < 0 || b < a) return res.status(502).json({ error: 'Could not read the page. Try a clearer, straight photo.' });
    let parsed;
    try { parsed = JSON.parse(txt.slice(a, b + 1)); } catch (_) {
      return res.status(502).json({ error: 'The scan result was not valid. Please try a clearer photo.' });
    }
    const out = cleanOutput(parsed);
    if (!out) return res.status(502).json({ error: 'Unexpected scan result. Please try again.' });
    return res.status(200).json(out);
  } catch (e) {
    // Keep the existing UI's retry prompt for an invalid personal Anthropic key.
    if (!gk && userAnthropicKey && !serverAnthropicKey) {
      return res.status(401).json({ code: 'badkey', error: 'The supplied scan key was rejected.' });
    }
    const status = e && e.status === 502 ? 502 : 500;
    // Do not expose provider stack traces or secrets in public responses.
    return res.status(status).json({ error: status === 502 ? 'Scan provider could not process this photo. Please try again.' : 'Scan failed. Please check the connection and try again.' });
  }
};
