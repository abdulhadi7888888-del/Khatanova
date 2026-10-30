// KhataNova: reads a photo of a manual (Urdu/English) khata page and returns rows as JSON.
// Needs the environment variable ANTHROPIC_API_KEY on Vercel.
// Optional: SCAN_SECRET (app will ask for it once), SCAN_MODEL (default below).
const MODEL = process.env.SCAN_MODEL || 'claude-sonnet-5-5';

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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server (Vercel > Settings > Environment Variables).' });
  const secret = process.env.SCAN_SECRET;
  if (secret && req.headers['x-scan-key'] !== secret) return res.status(401).json({ error: 'Wrong or missing scan key.' });
  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec((body && body.image) || '');
    if (!m) return res.status(400).json({ error: 'Send {image: "data:image/jpeg;base64,..."}' });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: PROMPT }
        ] }]
      })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'AI request failed' });
    const txt = (j.content || []).map(c => c.text || '').join('');
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a < 0 || b < a) return res.status(502).json({ error: 'Could not read the page. Try a clearer, straight photo.' });
    const out = JSON.parse(txt.slice(a, b + 1));
    if (!out || !Array.isArray(out.rows)) return res.status(502).json({ error: 'Unexpected AI answer.' });
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
