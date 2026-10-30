# KhataNova

Digital khata and stock app (Party ledger, Stock, Bills, Cash, Staff, Reports).

## Deploy (Vercel)
1. Push these files to GitHub and import the repo in Vercel.
2. For "Scan old khata (photo)": Vercel > Settings > Environment Variables
   - `ANTHROPIC_API_KEY` (required)
   - `SCAN_SECRET` (optional, protects the scan endpoint)
3. Redeploy. On phones, close and reopen the app once to load the new version.
