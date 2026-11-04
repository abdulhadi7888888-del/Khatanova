# Testing report (KhataNova 2030)

Automated, run in Chromium via Playwright against the real app. All suites pass.

| Suite | Covers |
|---|---|
| `core.test.js` | money math, rounding, migration of legacy grades, idempotency |
| `e2e-trade.js` | purchase 10x100, sale 4x150 -> stock 6, COGS 400, profit 200; partial payments, returns, refunds, void, quotation -> sale, ledger/cash derivation |
| `e2e-docs-stock.js` | invoices, delivery note, receipt, return prints; adjustments, transfers, warehouses |
| `e2e-reports.js` | dashboard numbers (hand-verified), 17 reports, CSV, XLSX opened with openpyxl, PDF preview |
| `e2e-security.js` | PIN set/change, lockout, auto-lock, recovery code, WebAuthn (virtual authenticator), roles/permissions |
| `e2e-encryption.js` | encrypted DB on/off, unlock prompt, data intact |
| `e2e-admin.js` | settings save/validation, auto backup, manual backup, integrity check (detects corrupted totals), CSV import (duplicates and bad numbers skipped), restore with pre-restore safety copy, encrypted backup download; no console errors |

## Not tested (honest limits)
- Native fingerprint/face through Capacitor on a real phone.
- Opening the exported .xlsx in Microsoft Excel itself (verified with openpyxl).
- Real printers; PDF is produced by the browser print dialog.
- Web Share sheet on physical devices (falls back to download).
- Auto backups live on the same device: they do not protect against losing the phone. Use the backup file.
