# KhataNova Security Update — Local-first IndexedDB

## Implemented in this update

- IndexedDB is the primary local persistence store (`KhataNovaLocal`, object store `app_state`).
- Existing `pvcdana_v1` localStorage data is migrated on first launch only when the IndexedDB business record is absent.
- Existing localStorage data is not deleted; the app keeps a compatibility mirror for legacy builds and backup recovery.
- Startup hydration is gated by a short loading veil so users do not interact with stale localStorage state while IndexedDB is opening.
- Encrypted backup export uses AES-256-GCM and PBKDF2-SHA-256 (250,000 iterations) with fresh random salt and nonce.
- Encrypted backup restore authenticates/decrypts before replacing the current in-memory business state. Legacy JSON backups remain supported.
- Service worker cache version is incremented to force updated app assets to load.

## Important limitations

- Active IndexedDB records are not encrypted at rest by this release. The encrypted backup protects exported backup files, not the browser's live database. Use device-level encryption and a strong device passcode.
- The existing four-digit PIN is a UI lock, not a cryptographic database key. Existing WebAuthn unlock is a browser platform-authenticator flow; it is not native Android BiometricPrompt or native iOS LocalAuthentication.
- IndexedDB and localStorage are per-browser/per-origin. There is no cloud synchronization or multi-device conflict resolution in this local-first build.
- Browser storage may be cleared or evicted. Keep encrypted backups outside the device and verify restores periodically.
- Encrypted backup password recovery is not possible. A wrong password or damaged file will fail authenticated decryption.
- Native biometric prompts, native secure enclave/keychain storage, configurable role permissions, and full SKU/warehouse accounting are not claimed as completed by this storage upgrade.

## Recommended operational practice

1. Use the app over HTTPS or localhost.
2. Use a strong device screen lock.
3. Create encrypted backups regularly and store at least one copy off-device.
4. Test a restore using a separate browser profile before relying on a backup.
5. Do not put AI provider API keys in `index.html`; keep them in server environment variables.
