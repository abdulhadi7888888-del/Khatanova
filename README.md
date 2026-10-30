# KhataNova

Digital khata and stock app (Party ledger, Stock, Bills, Cash, Staff, Reports).

## Deploy (Vercel)
1. Push these files to GitHub and import the repo in Vercel.
2. For "Scan old khata (photo)": Vercel > Settings > Environment Variables, add ONE of:
   - `GEMINI_API_KEY` (free key from aistudio.google.com > Get API key)
   - `ANTHROPIC_API_KEY` (paid credits)
   - `SCAN_SECRET` (optional, protects the scan endpoint)
   No key? Use "Paste data from Claude / ChatGPT" in the Party tab instead.
3. Redeploy. On phones, close and reopen the app once to load the new version.
