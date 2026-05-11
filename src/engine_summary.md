# Engine Logic Summary

## Overview

The engine is split into seven focused modules. All data lives in two PouchDB databases:
- `finances` — transaction documents
- `metadata_vault` — config documents (accounts, cards, routes, category rules)

All functions are user-scoped. Every query filters by `user_id` so no data bleeds between users.

---

## 1. CategorizationEngine

**Purpose:** Auto-tags transactions with a category based on keyword rules stored in `metadata_vault`.

**How it works:**
- Rules are stored as documents with `type: 'category_rule'`, each containing a `keywords` array and a `category_name`.
- On `autoTag`, all active rules for the user are loaded and sorted by keyword length (longest first) to ensure more specific matches win.
- The transaction description is lowercased and checked against each keyword. First match wins.
- Falls back to `'Uncategorized'` if nothing matches.

**Other methods:**
- `teachEngine` — adds a keyword to an existing rule, or creates a new rule if none exists.
- `addCategory` — creates a new rule and registers the category in `config_category_types_${userId}` as income, neutral, or expense.
- `deleteCategory` — removes the rule and strips the category from all three lists in the config.
- `updateCategoryKeywords` — replaces the keyword list for an existing rule.

---

## 2. TransferEngine

**Purpose:** Handles inter-bucket movements (e.g. Bank → Cash, Bank → Card).

**Config:** `config_finance_routes` in `metadata_vault`. Each route maps a category name to `{ from, to }` bucket names.

**Current routes:**
| Category | From | To |
|---|---|---|
| Cash Withdrawal | Bank | Cash |
| Cash Deposit | Cash | Bank |
| Credit Card Payment | Bank | Card |
| Provisions | Bank | Provisions |
| Provision Sweep | Provisions | Bank |
| Card Cash Withdrawal | Card | Cash |
| Card to Bank | Card | Bank |
| Balance c/d | null | Bank |

**How it works:**
- `applyTransfer(state, route, amount)` subtracts `Math.abs(amount)` from `state[from]` and adds it to `state[to]`.
- When `from === to` (e.g. a future Bank Transfer route), the net effect on bucket totals is zero — correct for same-bucket sub-account moves.

---

## 3. CardEngine

**Purpose:** Builds a due-date bucket view of credit card spending and tracks outstanding debt.

**How it works:**

**Date parsing (`_parseTxnDate`):**
Supports ISO format (`2026-05-07`), compact digits (`07052026`), and falls back to today. Always pass `txn.date` with `txn._id` as fallback.

**Card matching (`_isThisCard`):**
Matches a transaction to a card in this order:
1. Must look like a card transaction (`account_type` or `sub_account` contains "card").
2. Matched by `card.id` in `sub_account`.
3. Matched by `card.name` in `sub_account`.
4. If `card.is_default`, catches any transaction with "card" in `sub_account` (legacy fallback).

**Due date bucketing (`getDueDateBucket`):**
- If the transaction date is after `billing_day`, it belongs to the next statement cycle.
- Due date = statement month + `due_month_offset`, on `due_day`.

**`buildBuckets`:**
1. Loads all card transactions, excludes `Credit Card Bill`, `Credit Card Payment`, `Balance c/d`.
2. Buckets remaining spend by due date.
3. Takes only the single most recent `Credit Card Bill` as a carry-forward (summing all historical bills would double-count settled debt).
4. Applies payments chronologically against the oldest unpaid bucket first. A payment cannot settle a bucket due before the payment date.
5. Each bucket is marked `paid`, `outstanding`, or `overdue` based on today's date.

---

## 4. FinanceEngine

The core accounting engine. Three public methods.

### `_getAnchor` (private)

Returns the opening balance state `{ Bank, Cash, Card, AR, Provisions }` for a given month.

**Genesis month (≤ 2026-05):**
- Starts from zero (or a legacy `active_snapshot` if one exists).
- Scans the month for `Balance c/d` (Bank) and `Cash c/d` (Cash) transactions.
- Accumulates them with `+=` — so multiple accounts opened in the genesis month are all summed correctly.

**Normal months (after 2026-05):**
- Recursively calls `reconstructBalances` on the previous month to get `prevFinalBalances`.
- Scans the current month for any new `Balance c/d` or `Cash c/d` entries (new accounts being opened).
- Returns `prevFinalBalances.Bank + currentMonthBalanceCD`.

**Key rule:** A `Balance c/d` entry is always additive. It never replaces a previous balance. This means Balance c/d should only ever be used when opening a new account.

**Snapshot cache:** If a `snapshot_${userId}_${monthPrefix}` document exists in `metadata_vault`, it is returned immediately without any computation. Snapshots can be written to freeze a month's state.

### `reconstructBalances(transactionsDB, metadataDB, monthPrefix, userId)`

Returns `{ buckets, metrics, transactions }` for a given month.

**`buckets`** — comes entirely from `_getAnchor`. Regular transactions do not mutate bucket state. The anchor IS the correct balance.

**`metrics`** — computed from current-month non-c/d transactions:
- `grossIncome` — sum of absolute amounts for positive-category transactions (excluding `Reimbursement Received`).
- `grossExpense` — sum of absolute amounts for non-income, non-neutral, non-c/d transactions.
- `reimbursableExpenses` — subset of grossExpense where `txn.is_reimbursable` is true.
- `reimbursementsReceived` — absolute amount of `Reimbursement Received` transactions.
- `netIncome` = grossIncome − reimbursementsReceived.
- `netExpense` = grossExpense − reimbursableExpenses.

**`AR`** — tracked separately (not in anchor): incremented by reimbursable expenses, decremented by Reimbursement Received.

**Skipped entirely:** `Balance c/d` and `Cash c/d` — they are baked into the anchor and must never appear in flow metrics.

### `getBankAccountBalances(transactionsDB, metadataDB, userId)`

Returns `{ accounts: [{ account, balance, transactionCount }], total }`.

Replays every historical Bank transaction for the user:
- `Balance c/d` and `Opening Balance` are always treated as credits (`+= Math.abs(amount)`).
- Positive amounts are credits, negative amounts are debits.
- Matched to accounts by `sub_account` name or id (case-insensitive).

This gives the true live running balance per account, as opposed to `reconstructBalances` which gives the month-level anchor snapshot.

---

## 5. ProvisionEngine

**Purpose:** Manages named provision pots (savings buckets within the Provisions pool).

Stored in `config_provisions` in `metadata_vault`. Each provision has a name, optional target amount, and user_id. Methods: `getAll`, `add`, `remove`. The engine does not track individual provision balances — that is handled at the transaction level via the Provisions route.

---

## 6. TemporalEngine

**Purpose:** Date-aware transaction queries.

- `getLedgerForMonth(transactionsDB, year, month, userId)` — returns all transactions for a given year/month. Supports ISO dates, compact digit IDs, and prefix matching.
- `getAllMonths(transactionsDB, userId)` — returns a sorted array of all month strings (`YYYY-MM`) that have at least one transaction for the user. Derived from `txn.date` with `txn._id` as fallback.

---

## 7. AnalyticsEngine

**Purpose:** Monthly trend aggregation across all time.

### `getMonthlyTrends(transactionsDB, metadataDB, userId)`

Returns `[{ month, income, expense, investment, net, byCategory }]` sorted chronologically.

**Rules:**
- Reads `config_category_types_${userId}` for positive and neutral category lists.
- `Balance c/d` and `Cash c/d` must be skipped (they are structural anchors, not flow events). These should be in `neutral_categories` — if not, a hardcoded guard in the engine catches them.
- Neutral categories are skipped entirely.
- Positive categories (except `Reimbursement Received`) add to `income`.
- Everything else adds to `expense`.
- `investment` is a subset of expense where `category === 'Investment'`.
- `net` = income − expense.
- Month key is derived from `txn.date` with `txn._id` as fallback.

### `getCategoryTrend(transactionsDB, metadataDB, userId, category)`

Returns `[{ month, amount }]` for a single category across all months. Thin wrapper over `getMonthlyTrends`.

---

## 8. AccountEngine

**Purpose:** CRUD for bank accounts and cards stored in `metadata_vault`.

**Accounts** live in a single shared `config_accounts` document, filtered by `user_id` at read time. **Cards** live in `config_cards`, same pattern.

**Methods:**
- `getAccounts` — all accounts for user.
- `getBankAccounts` — filtered to `parent === 'Bank'`.
- `getCards` — all cards for user.
- `getDefaultAccount(parentType)` — finds the `is_default` account for a bucket type, falls back to first match.
- `getDefaultCard` — finds `is_default` card, falls back to first.
- `addAccount` — adds a new account, respects `accountData.parent` (does not hardcode 'Bank'). Unsets other defaults in the same parent group if `is_default` is true.
- `updateAccount` — merges updates, handles default promotion.
- `deleteAccount` — splices from the array by `id + user_id`.

---

## Category Config

Stored as `config_category_types_${userId}` in `metadata_vault`.

| List | Effect |
|---|---|
| `positive_categories` | Counted as income in metrics and trends |
| `neutral_categories` | Skipped entirely — no income, no expense |
| `expense_categories` | Informational only — engine classifies by exclusion, not this list |

**Structural categories that must always be neutral:**
`Balance c/d`, `Cash c/d`, `Credit Card Bill`, `Credit Card Payment`, `Cash Withdrawal`, `Cash Deposit`, `Card to Bank`, `Card Cash Withdrawal`, `Provision Sweep`, `Provision C/D`, `Provisions`

---

## Account Closure Procedure

No special engine support needed. Use existing primitives:

1. Pay off any card debt: **Credit Card Payment** from the closing account.
2. **Cash Withdrawal** from the closing account (Bank → Cash).
3. **Cash Deposit** into the receiving account (Cash → Bank).
4. Remove the account from `config_accounts` via `AccountEngine.deleteAccount`.

Both withdrawal and deposit should be entered on the same day. Since the engine is accrual-based, the Cash bucket shows the correct state as long as both legs are in the same reporting period.

---

## Data Flow Summary

```
Transaction entered
        │
        ├── CategorizationEngine.autoTag()   → assigns category
        │
        ├── TransferEngine.resolveRoute()    → determines bucket movement
        │
        ├── CardEngine.buildBuckets()        → if card transaction, updates due-date view
        │
        ├── FinanceEngine._getAnchor()       → opening balance for the month (c/d chain)
        │        └── FinanceEngine.reconstructBalances()  → buckets + flow metrics
        │
        ├── FinanceEngine.getBankAccountBalances()  → live per-account running totals
        │
        └── AnalyticsEngine.getMonthlyTrends()      → historical income/expense trends
```
