# Deploying KhataNova 2030

The app is static files. Any HTTPS static host works (Vercel config is included: `vercel.json`).

1. Upload the whole folder (keep `index.html`, all `kn-*.js`, `sw.js`, `manifest.webmanifest`, icons).
2. Serve over **HTTPS** (needed for service worker, install prompt, WebAuthn biometric and Web Crypto).
3. Optional: `api/` holds the bill-scan function; set its environment variables on the host only if you use scanning.
4. Updating: change files, then bump the cache name in `sw.js` (`khatanova-vNN`). Users get the update on next open; their data is untouched because storage is separate from the cache.
5. Install on phone: open the site in Chrome/Safari, "Add to Home screen".

## Native biometric (optional)
A website can only use fingerprint/face through the browser's WebAuthn (platform authenticator). For a real native app wrap with Capacitor and use a biometric plugin exposing `BiometricAuth.authenticate`; the adapter is in `kn-security.js` (not tested on a physical device here). See `SECURITY-2030.md`.

## Before going live checklist
- Set an owner PIN and write down the recovery code.
- Take a first backup file (Settings, Business and data tools, Create and share) and store it off the phone.
- Check the integrity check shows no problems.
