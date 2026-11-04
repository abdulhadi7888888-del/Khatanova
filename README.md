# KhataNova 2030

Local-first business app (khata, inventory, sales/purchases, invoices, reports) as a single installable PWA.
No server needed: all records live on the device in IndexedDB (`KhataNovaLocal`). The `api/` folder (bill scan proxy) is optional.

## What is inside
| Area | Files |
|---|---|
| App shell, legacy khata/stock/cash/bills/staff | `index.html`, `sw.js`, `manifest.webmanifest` |
| Data foundation, money helpers, migration, audit | `kn-core.js` |
| Products, SKU/barcode, units, warehouses | `kn-products.js`, `kn-stock.js` |
| Sales, purchases, quotations, returns, payments (weighted-average cost, COGS) | `kn-trade.js` |
| Invoice / quote / delivery note / receipt / return printing, PDF, WhatsApp | `kn-print.js` |
| Dashboard, 17 reports, CSV / Excel / PDF export | `kn-reports.js` |
| PIN, auto-lock, lockout, biometric, 6 roles, encrypted DB | `kn-security.js`, `kn-security-ui.js` |
| Business settings, daily auto-backup, restore, integrity check, CSV import, encrypted backup file | `kn-admin.js` |

## Key rules
- Existing records are never deleted or rewritten; schema v2 only adds arrays (see `DATABASE.md`).
- Money is stored in integer paisa; averages use weighted average cost.
- Party ledger and cash/bank are derived from documents, so nothing is posted twice.
- Every sensitive action is permission-checked and written to the audit log.

## Run locally
```
python3 -m http.server 8099      # any static server works
# open http://localhost:8099/index.html
```
Service workers need `http://localhost` or HTTPS.

## Tests
```
export NODE_PATH=$(npm root -g)   # needs Playwright + Chromium
node tests/core.test.js
for t in e2e-trade e2e-docs-stock e2e-reports e2e-security e2e-encryption e2e-admin; do node tests/$t.js; done
```
(They expect the app served on port 8099.) See `TESTING-REPORT.md`.

See also: `DEPLOY.md`, `DATABASE.md`, `SECURITY-2030.md`, `ROADMAP.md`.
