# Database (IndexedDB `KhataNovaLocal`, store `app_state`)

| Key | Content |
|---|---|
| `business` | `{id, schemaVersion:2, updatedAt, data}` or `{..., enc}` when database encryption is on |
| `backup_<ms>` | full copy of `data` (or encrypted) made by auto/manual/pre-restore backup |
| `bmeta_<ms>` | small description of a backup: kind, counts, size, encrypted flag |

Mirror: `localStorage.pvcdana_v1` (plain copy; skipped when encryption is on).

## `data` (schema v2)
Legacy, unchanged: `grades, tx, pay, ph, pt, cash, exp, staff, att, sp, ot, bills, due, biz, cfg`.
Added: `products, warehouses, purchases, sales, stockMoves, accounts, audit, users, categories, quotes, roles, meta{schema,keys,seq}`.

- Money: integer paisa (`KN.toMinor`). Quantities: up to 3 decimals. Weighted average cost: `product.avgCost`.
- A sale/purchase document holds `items[{product,qty,rate,disc,net,cogs}]`, `subtotal, discount, tax, total, paid, payments[], returns[], void`.
- `stockMoves` is append-only; stock = legacy tx for migrated products + sum of moves.
- Settings added in Phase 7: `cfg.invPrefix, cfg.tradeTax, cfg.negStock, cfg.dateFmt, cfg.autoBackup`, `biz.logo, biz.tax`.
- Backups: last 7 auto/manual copies and last 3 pre-restore copies are kept.
