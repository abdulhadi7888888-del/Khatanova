# KhataNova 2030 — Build roadmap (phased, non-destructive)

Existing app: single-file PWA (index.html, ~1350 lines), data in IndexedDB `KhataNovaLocal` + mirror `pvcdana_v1`.
Existing modules kept: party khata, stock (kg grades), production, bills, cash book, staff, reports, scan API.

| Phase | Scope | Risk |
|---|---|---|
| 1 | Data foundation: DB v2 (additive stores: products, warehouses, purchases, sales, payments, audit, users), migration grades -> products, decimal-safe money helpers, audit log | Low |
| 2 | Product inventory UI: product CRUD, image, SKU/barcode, units, stock dashboard, product detail | Medium |
| 3 | Stock IN/OUT: purchase and sale flows, weighted avg cost, COGS, ledger + cash/bank posting in ONE transaction, negative-stock guard | High |
| 4 | Adjustments/transfers (reason + audit), invoices (numbering, PDF, WhatsApp), quotation, delivery note, receipts | Medium |
| 5 | Dashboard + reports + CSV/Excel/PDF export, charts | Medium |
| 6 | Security: PIN hash+lockout, auto-lock, WebAuthn, roles/permissions, encrypted-at-rest option | High |
| 7 | Backup/restore/integrity check, CSV import, business settings, docs, final ZIP — DONE |

Rule: after each phase -> syntax check + automated logic tests + checkpoint. No existing record is deleted or rewritten.

## Status
- Phase 1 DONE: `kn-core.js` (money in paisa, uid, audit, idempotency keys, additive schema v2, grades->products migration), wired into index.html, sw.js cache v21. `node tests/core.test.js` passes; legacy keys verified unchanged.
- Phase 2 DONE: `kn-products.js` (Products overlay: dashboard, list/search/filter, add/edit/detail, image, SKU auto, barcode + camera scan where supported, custom units, duplicate guards, audit, activate/delete rules). Entry: Home tile + Stock page button. Verified in real Chromium (legacy data migrated, persisted in IndexedDB, reload ok, 0 console errors). SW cache v22.
- Phase 3 DONE: `kn-trade.js` Sales & Purchases. One document per sale/purchase (items, tax, discount, payments); party ledger + cash/bank DERIVED via hooks in `lines()` / `cashR()` (no double posting). Weighted-average cost, COGS + gross profit, negative-stock guard (owner option), supplier invoice duplicate check, idempotency key against double submit, rollback on error, bank accounts, add-payment, cancel (void) with reason + reversing stock moves + audit. `tests/e2e-trade.js` (Playwright) verified: 10x100 buy / 4x150 sale -> stock 6, COGS 400, profit 200.
- NOTE for Phase 5 reports: always exclude documents where `d.void` is set.
- Phase 4 DONE: `kn-print.js` (invoice, purchase invoice, quotation, delivery note, payment receipt, return note; in-app preview, Print/Save as PDF, WhatsApp text), `kn-stock.js` (damaged/lost/expired, manual correction, physical count, opening adjustment, warehouse transfer, add warehouse; reason + audit mandatory), returns (sales/purchase, optional cash/bank refund, capped), quotations (convert to sale), `tests/e2e-docs-stock.js` passes (Chromium).
- Phase 5 DONE: `kn-reports.js` Dashboard (sales, purchases, receivables, payables, cash, bank, stock value, expenses, gross/net profit, daily summary, SVG sales-vs-expense chart, top products, low-stock alerts, recent transactions, quick actions, date ranges) + 17 reports (+2 stock shortcuts) with CSV, real XLSX (own writer, verified with openpyxl) and PDF (print preview). All numbers derive from saved records; cancelled docs excluded; salaries (not advances) and stock losses count as expenses. `tests/e2e-reports.js` passes.
- Phase 6 DONE: `kn-security.js`, `kn-security-ui.js`, `SECURITY-2030.md`. Strong PIN hash + lockout + auto-lock + recovery code + WebAuthn/native biometric + sessions + 6 roles x 18 permissions + optional AES-GCM encrypted DB + security log. Tests: `tests/e2e-security.js`, `tests/e2e-encryption.js` (pass). Remaining: Phase 7 (settings polish: logo/currency/invoice prefs, backup integrity check + auto backup, theme polish, README/DEPLOY/TESTING report, final ZIP).
- Phase 7 DONE: `kn-admin.js` (business/invoice settings, logo, auto daily backup, restore with safety copy, integrity check, CSV import, encrypted share/export), README/DEPLOY/DATABASE/TESTING-REPORT rewritten, cache v27. `tests/e2e-admin.js` passes.
