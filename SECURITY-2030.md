# KhataNova 2030 - Security (Phase 6)

## What is implemented (all tested in Chromium, see `tests/e2e-security.js`, `tests/e2e-encryption.js`)
| Feature | Detail |
|---|---|
| PIN lock | 4-6 digits, PBKDF2-SHA256 (150,000 iterations), random 16-byte salt per user. Trivial PINs (0000, 1234 ...) rejected. |
| Old PIN upgrade | The old weak PIN hash is verified once, then replaced by the strong hash and deleted. |
| Failed attempts | 5 wrong PINs -> lockout 30 s, then 1 m, 5 m, 15 m, 1 h. Stored on the device, survives reload. Correct PIN is ignored during lockout. |
| Auto-lock | Configurable: immediately / 30 s / 1 m / 5 m / 15 m / never when app is hidden, plus idle timeout (off, 1-30 min). Cold start always locks; a reload within 60 s resumes. |
| Recovery | One-time recovery code (80 bits, stored hashed) resets the owner PIN. Wrong codes are rate-limited. Lost PIN + lost code = restore an encrypted backup or erase local data. |
| Biometric | Browser: WebAuthn platform authenticator (OS verifies the user; the site never sees a fingerprint). Native app: Capacitor `BiometricAuth` plugin is used automatically if present. PIN is required again every 3 days. |
| Sessions / logout | Per-user session; "Log out" locks the app, closes all screens and returns to the user picker. |
| Roles | Owner, Admin, Manager, Salesperson, Accountant, Stock operator. 18 permissions; owner can edit each role's permissions. |
| Enforcement | Navigation tiles and every sensitive action (reports, sales/purchases, payments, returns, cancel, products, stock changes, delete, settings, users, security) check permissions. |
| Encrypted database | Optional: AES-256-GCM, key from a passphrase (PBKDF2, 250,000 iterations). Passphrase asked at app start. No plaintext copy is kept in localStorage while on. |
| Security log | Logins, failed logins, locks, PIN/role/user/encryption changes, denied actions (kept in the audit log, included in backups). |

## Honest limits
- This is a web app. Anyone with developer tools on an **unlocked** device can bypass any client-side lock. The PIN protects against casual access; use a strong phone screen lock and device encryption.
- A 4-6 digit PIN hash can be brute-forced offline if the stored hash is copied. Real at-rest protection comes only from **Database encryption** with a long passphrase.
- The database passphrase and recovery code cannot be recovered by anyone, including us. Keep an encrypted backup (Settings -> Backup).
- Users and roles are stored in your business data (included in backups). PINs stay on each device; after restoring on a new device the owner sets PINs again.
- Native fingerprint / Face ID is **not** available to a plain website. The native adapter below was written against the plugin API but could not be run here (no phone/emulator); test it on a device.

## Native Android / iPhone biometric (Capacitor)
```bash
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios @aparajita/capacitor-biometric-auth
npx cap init KhataNova com.yourcompany.khatanova --web-dir=.
npx cap add android && npx cap add ios && npx cap sync
```
Android: `BiometricPrompt` is used by the plugin. iOS: add `NSFaceIDUsageDescription` to Info.plist. `kn-security.js` detects `Capacitor.Plugins.BiometricAuth` and calls `checkBiometry()` / `authenticate()`; no other code change is needed. If your plugin version names the plugin differently, adjust `nativeBio()` in `kn-security.js`.

## Roles (defaults)
Owner: everything. Admin: everything except Security settings. Manager: dashboards, reports, sales, purchases, payments, returns, products, stock changes, cash. Salesperson: sales, payments, view parties/stock. Accountant: dashboards, reports, payments, cash, view parties/stock. Stock operator: products, stock changes, purchases.
