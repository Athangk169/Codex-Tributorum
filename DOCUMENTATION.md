# Codex Tributorum — Comprehensive Documentation

> **App ID:** `com.Sanguinius` | **Version:** `0.0.0` | **Stack:** React 19 + Vite + PouchDB + Capacitor

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Core Modules](#5-core-modules)
   - 5.1 [Finance Engine (`engine.js`)](#51-finance-engine-enginejs)
   - 5.2 [Data Hook (`useFinanceData.js`)](#52-data-hook-usefinancedatajs)
   - 5.3 [Audio System (`audioCore.js`)](#53-audio-system-audiocorejs)
6. [UI Screens (Slides)](#6-ui-screens-slides)
7. [Database Design](#7-database-design)
8. [Backend Services](#8-backend-services)
   - 8.1 [Auspex Daemon (`auspex_daemon.py`)](#81-auspex-daemon-auspex_daemonpy)
   - 8.2 [Migration Script (`import.py`)](#82-migration-script-importpy)
9. [Cross-Platform Targets](#9-cross-platform-targets)
   - 9.1 [Android (Capacitor)](#91-android-capacitor)
   - 9.2 [Web (PWA / Service Worker)](#92-web-pwa--service-worker)
10. [Authentication & Boot Flow](#10-authentication--boot-flow)
11. [Getting Started](#11-getting-started)
12. [Configuration Reference](#12-configuration-reference)
13. [Document ID Conventions](#13-document-id-conventions)

---

## 1. Project Overview

**Codex Tributorum** (Latin: *Book of Taxes/Tributes*) is a personal finance dashboard with a Warhammer 40K–inspired "Imperial Command" aesthetic. It is a fully offline-first, cross-platform application that runs on:

- **Android** — via Capacitor
- **Web** — as a Progressive Web App (PWA)

The application allows a user to track transactions, manage bank accounts and credit cards, monitor investments (Indian equities and mutual funds), forecast liquidity, and visualize financial trends — all stored locally in PouchDB with optional sync to a remote CouchDB server. The Holo slide features HTML-based holographic visualizations and interactive 3D `.glb` models rendered via Google's `<model-viewer>` component.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    React 19 Frontend                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Desktop UI │  │  Mobile UI  │  │   Shared Hooks  │  │
│  │ (CrtShell)  │  │(MobileShell)│  │ useFinanceData  │  │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
│         └────────────────┴──────────────────┘           │
│                          │                              │
│              ┌───────────▼──────────┐                   │
│              │     Finance Engine   │                   │
│              │  (engine.js utils)   │                   │
│              └───────────┬──────────┘                   │
└──────────────────────────┼──────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   PouchDB (local store) │
              │  finances / metadata /  │
              │     investments_vault   │
              └────────────┬────────────┘
                           │ CouchDB Sync (optional, via credentials at boot)
              ┌────────────▼────────────┐
              │  Remote CouchDB Server  │
              │  (Raspberry Pi / VPS)   │
              └─────────────────────────┘
                           ▲
              ┌────────────┴────────────┐
              │  auspex_daemon.py       │
              │  (market data updater)  │
              │  AMFI + Yahoo Finance   │
              └─────────────────────────┘
```

The frontend is self-contained. PouchDB stores all data locally and replicates to a remote CouchDB instance when a host/credentials are provided at login. The `auspex_daemon.py` runs independently on a server (e.g., Raspberry Pi hosting CouchDB) and directly updates the `investments_vault` database with live market prices on a 15-minute cycle.

> **Note:** The repository contains `electron.cjs` and `preload.cjs` files, which are remnants of an earlier or planned desktop target. Electron is **not** listed as a dependency in `package.json` and is not an active build target. The supported platforms are Web and Android only.

---

## 3. Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| UI Framework | React | ^19.2.5 | Component-based UI |
| Build Tool | Vite | ^8.0.10 | Dev server, bundler |
| Mobile | Capacitor | ^8.3.3 | Android APK packaging |
| Local DB | PouchDB | ^9.0.0 | Offline-first storage |
| Remote DB | CouchDB | (external) | Server-side sync target |
| Animations | anime.js | ^4.4.1 | UI transitions & effects |
| 3D Viewer | @google/model-viewer | ^4.2.0 | `.glb` 3D model rendering in HoloSlide |
| Market Data | yfinance + AMFI | (Python) | Investment price sync daemon |
| Linting | ESLint | ^10.2.1 | Code quality |

---

## 4. Project Structure

```
Codex-Tributorum/
├── src/
│   ├── App.jsx                  # Root component — routing + layout orchestration
│   ├── main.jsx                 # React entry point + service worker registration
│   ├── index.css                # Base styles
│   ├── styles/
│   │   └── GlobalStyles.css     # Global CSS variables and resets
│   ├── components/
│   │   ├── CrtShell.jsx         # Desktop CRT-effect wrapper
│   │   ├── layout/              # Desktop layout components
│   │   │   ├── BootScreen.jsx
│   │   │   ├── ImperialHeader.jsx
│   │   │   ├── TacticalNav.jsx
│   │   │   └── SystemFooter.jsx
│   │   ├── mobile/              # Mobile-specific components
│   │   │   ├── MobileShell.jsx
│   │   │   ├── MobileHeader.jsx
│   │   │   ├── MobileNav.jsx
│   │   │   ├── MobileBootScreen.jsx
│   │   │   └── slides/          # Mobile screen views
│   │   ├── slides/              # Desktop screen views
│   │   │   ├── OverviewSlide.jsx
│   │   │   ├── LedgerSlide.jsx
│   │   │   ├── AuspexSlide.jsx
│   │   │   ├── LiquiditySlide.jsx
│   │   │   ├── HoloSlide.jsx
│   │   │   └── BankAccountsSlide.jsx
│   │   └── shared/              # Shared/reusable components
│   ├── hooks/
│   │   ├── useFinanceData.js    # Main data access hook (PouchDB)
│   │   ├── useIsMobile.js       # Responsive layout detection
│   │   └── useBudgets.js        # Per-category monthly spending caps (quotas)
│   └── utils/
│       ├── engine.js            # Core finance calculation engines
│       ├── audioCore.js         # BGM and SFX audio system
│       └── dataTithe.js         # Admin-only full-DB Excel export (footer button)
├── scripts/
│   └── restore.mjs              # Rebuild CouchDB from a data-tithe .xlsx backup
├── public/
│   └── sw.js                    # Service worker (offline caching)
├── android/                     # Capacitor Android project
├── electron.cjs                 # Legacy/experimental desktop entry (not an active build target)
├── preload.cjs                  # Legacy/experimental Electron preload (not an active build target)
├── capacitor.config.json        # Capacitor configuration
├── vite.config.js               # Vite build configuration
├── package.json                 # Node.js dependencies and scripts
├── auspex_daemon.py             # Market data sync daemon (Python)
└── import.py                    # One-time migration script from legacy system
```

---

## 5. Core Modules

### 5.1 Finance Engine (`engine.js`)

Located at `src/utils/engine.js`, this file is the computational heart of the app. It exports four distinct engines:

---

#### `CategorizationEngine`

Handles automatic and manual transaction categorization using keyword-based rules stored in PouchDB.

| Method | Description |
|--------|-------------|
| `autoTag(rawDescription, metadataDB, userId)` | Scans loaded rules in descending keyword-length order; returns the first matching category name, or `'Uncategorized'` |
| `teachEngine(keyword, targetCategory, metadataDB, userId)` | Adds a new keyword to an existing category rule document |
| `addCategory(name, type, keywords, metadataDB, userId)` | Creates a new category rule and appends it to the user's category config document |
| `deleteCategory(name, metadataDB, userId)` | Removes a category rule and strips the name from the category config |
| `updateCategoryKeywords(name, keywords, metadataDB, userId)` | Replaces the keyword list on an existing rule |

**Category types:** `income`, `neutral`, `expense`

---

#### `TransferEngine`

Manages double-entry style balance routing — maps transaction categories to source/destination account slots.

| Method | Description |
|--------|-------------|
| `getRoutes(metadataDB)` | Loads the `finance:config:routes` document |
| `resolveRoute(category, metadataDB)` | Returns the `{ from, to }` route for a given category |
| `applyTransfer(state, route, amount, txn)` | Mutates a balance state object by applying debits and credits, with awareness of sub-accounts (e.g., `bank_hdfc`, `card_SBI_cc`) |

---

#### `CardEngine`

Handles credit card billing cycle calculations and payment bucket grouping.

| Method | Description |
|--------|-------------|
| `getDueDateBucket(txnDateSrc, card)` | Calculates which billing cycle a transaction falls into, using `billing_day`, `due_day`, and `due_month_offset` from the card config |
| `buildBuckets(transactionsDB, metadataDB, userId, cardId)` | Groups all card transactions into due-date buckets with totals, paid amounts, and outstanding balances |

---

#### `AccountEngine`

Provides CRUD access for bank accounts and credit cards stored in the metadata database.

| Method | Description |
|--------|-------------|
| `getAccounts(metadataDB, userId)` | Returns all `finance:account:*` documents for a user |
| `getCards(metadataDB, userId)` | Returns all `finance:card:*` documents for a user |
| `createAccount(data, metadataDB, userId)` | Creates a new account with a namespaced ID |
| `createCard(data, metadataDB, userId)` | Creates a new card document |
| `updateAccount(id, updates, metadataDB)` | Patches an existing account document |
| `deleteAccount(id, metadataDB)` | Removes an account document |

---

### 5.2 Data Hook (`useFinanceData.js`)

**`src/hooks/useFinanceData.js`** — The primary React hook that connects the UI to PouchDB. It:

1. **Initializes three PouchDB databases:**
   - `finances` — all transaction records
   - `metadata` — accounts, cards, categories, rules, routes, configs
   - `investments_vault` — investment portfolio data

2. **Sets up CouchDB replication** — if credentials include a `host`, it opens bidirectional live sync to the remote server.

3. **Aggregates `financeData`** — a computed object rebuilt on every database change, containing:
   - `metrics` — net worth, income, expenses, savings rate
   - `transactions` — categorized and sorted transaction list
   - `accounts` / `cards` — balance state per sub-account
   - `investments` — current portfolio with P&L
   - `snapshots` — monthly archive data for trend charts

4. **Exposes `syncLed`** — a status indicator (`syncing`, `ok`, `error`) that drives the sync LED in the header.

5. **Exposes `dbs`** — raw database handles (`txns`, `meta`, `inv`) passed down to slides that need write access.

---

### 5.3 Audio System (`audioCore.js`)

**`src/utils/audioCore.js`** — A static singleton class (`AudioCore`) that manages background music and sound effects to reinforce the Imperial theme.

| Method | Description |
|--------|-------------|
| `AudioCore.playBGM()` | Starts ambient background music after boot |
| `AudioCore.stopBGM()` | Stops BGM (called on component unmount) |
| `AudioCore.playSFX('click')` | Plays a one-shot sound effect for UI interactions |

Audio is activated only after the boot screen completes, preventing autoplay policy violations.

---

## 6. UI Screens (Slides)

The app uses a "slide" navigation metaphor — each major view is a full-screen "slide" switched via the navigation bar. Both desktop and mobile have parallel implementations.

| Slide Key | Desktop Component | Mobile Component | Description |
|-----------|------------------|-----------------|-------------|
| `overview` | `OverviewSlide` | `MobileOverview` | Net worth summary, income vs. expense metrics, monthly trend charts |
| `ledger` | `LedgerSlide` | `MobileLedger` | Full transaction log with add/edit/delete, auto-categorization, manual category override |
| `auspex` | `AuspexSlide` | `MobileAuspex` | Investment portfolio tracker (value, P&L, snapshots); also expense trends, upkeep burn-rate, monthly archive, and per-category budget quotas (Munitorum Tithe-Grant) |
| `liquidity` | `LiquiditySlide` | `MobileLiquidity` | Cash flow forecasting and liquidity analysis |
| `holo` | `HoloSlide` | `MobileHolo` | HTML holographic visualizations + interactive `.glb` 3D models via `<model-viewer>` |
| `bank` | `BankAccountsSlide` | `MobileBank` | Bank accounts and credit card management, card billing buckets |

### HoloSlide — 3D & Holographic Display

The `HoloSlide` (and its mobile counterpart `MobileHolo`) is the app's signature visual centrepiece. It combines:

- **HTML holograms** — CSS/animation-driven holographic UI panels styled to match the Imperial aesthetic
- **3D model viewer** — Uses the `@google/model-viewer` web component to render `.glb` 3D models directly in the browser. Models are interactive (rotate, pan, zoom) and work across both platforms (web and Android) since `<model-viewer>` is a standard web component.

The `@google/model-viewer` version `^4.2.0` supports augmented reality (AR) on Android, which can optionally be enabled in the Capacitor build.

### Desktop Layout Components

| Component | Role |
|-----------|------|
| `CrtShell` | Root wrapper applying the CRT monitor visual effect (scanlines, screen curvature) |
| `BootScreen` | Login / credential entry screen shown before the app loads |
| `ImperialHeader` | Top bar with net worth metrics, sync LED, and user callsign |
| `TacticalNav` | Horizontal navigation bar for switching slides |
| `SystemFooter` | Bottom status bar: lore ticker, VOX mute toggle, and admin-only `[ TITHE: EXTRACT ]` full-database Excel backup (Sanguinius only — see OPERATIONS.md §3) |

### Mobile Layout Components

| Component | Role |
|-----------|------|
| `MobileShell` | Full-screen mobile wrapper |
| `MobileBootScreen` | Mobile-optimized login screen |
| `MobileHeader` | Compact header with key metrics |
| `MobileNav` | Bottom navigation tab bar |

The `useIsMobile` hook drives the conditional rendering between desktop and mobile layouts in `App.jsx`.

---

## 7. Database Design

Codex Tributorum uses **three PouchDB databases**, each synced to a corresponding CouchDB database on the remote server.

### `finances` (Transaction Database)

Stores all financial transactions.

**Document ID format:** `txn:{userId}:{YYYY-MM-DD}:{randomSuffix}`

**Transaction document shape:**
```json
{
  "_id": "txn:Sanguinius:2026-05-15:x7k2p",
  "type": "transaction",
  "user_id": "Sanguinius",
  "date": "2026-05-15",
  "description": "HDFC ATM Withdrawal",
  "amount": -2000,
  "category": "Cash Withdrawal",
  "account_type": "Bank",
  "sub_account": "bank_hdfc",
  "created": "2026-05-15T10:30:00.000Z"
}
```

### `metadata` (Configuration Database)

Stores all configuration, account definitions, category rules, and monthly snapshots.

**Document ID namespaces:**

| ID Pattern | Purpose |
|-----------|---------|
| `finance:account:{userId}:{accountId}` | Bank account definition |
| `finance:card:{userId}:{cardId}` | Credit card definition |
| `finance:rule:{userId}:{categorySlug}` | Auto-categorization rule |
| `finance:budget:{userId}:{categorySlug}` | Per-category monthly spending cap (quota) — actuals derived from trends, not stored |
| `finance:config:categories:{userId}` | User's income/expense/neutral category lists |
| `finance:config:routes` | Category-to-account routing table (system-wide) |
| `finance:config:analytics` | Analytics configuration (system-wide) |
| `finance:snapshot:{userId}:{YYYY-MM}` | Monthly balance snapshot for trend data |

### `investments_vault` (Investments Database)

Stores portfolio manifest and monthly performance snapshots. This database is updated directly by `auspex_daemon.py` on the server side; the frontend reads it via CouchDB sync.

| ID Pattern | Purpose |
|-----------|---------|
| `finance:investments:current:{userId}` | Live portfolio manifest with current prices |
| `finance:investments:snapshot:{userId}:{YYYY-MM}` | Monthly portfolio archive |

**Balance state shape (subaccount-aware):**
```json
{
  "Bank":        { "bank_hdfc": 45910, "bank_sbi": 7430 },
  "Card":        { "card_SBI_cc": 5172 },
  "Cash":        { "cash_main": 0 },
  "AR":          0,
  "Provisions":  0
}
```

---

## 8. Backend Services

### 8.1 Auspex Daemon (`auspex_daemon.py`)

A standalone Python script designed to run as a long-lived background service (e.g., on a Raspberry Pi running CouchDB). It executes a market data sync loop every **15 minutes**.

**What it does on each run:**

1. **User discovery** — Scans `investments_vault` for every `finance:investments:current:{userId}` manifest, so it sweeps **all** users — existing and any added later — with no config change.

2. **Monthly archival check** — For each user, if no snapshot exists for the previous month, it reads that user's manifest and writes a `finance:investments:snapshot:{userId}:{YYYY-MM}` document.

3. **Dual-source price fetch (deduplicated across the union of all holdings):**
   - **Indian Mutual Funds** — Fetches `NAVAll.txt` from AMFI ([amfiindia.com](https://www.amfiindia.com/spages/NAVAll.txt)) **once** and resolves scheme codes via the `ALIAS_MATRIX` lookup table.
   - **NSE Equities** — Fetches each **unique** ticker once via `yfinance`, automatically appending `.NS` for NSE-listed stocks.

4. **Price update commit** — Applies the shared price map to each user and writes back only the manifests whose prices changed, recording `last_updated`.

#### The ALIAS_MATRIX

The `ALIAS_MATRIX` is a future-proof translation layer that maps the UI-facing ticker names to their actual data-source identifiers. This decouples how the app displays a fund/stock from how the daemon fetches its price.

```python
# Format: "UI_TICKER": "AMFI:SCHEME_CODE"  (for mutual funds)
#         "UI_TICKER": "NSE_TICKER"         (for equities — resolved automatically)
ALIAS_MATRIX = {
    "MUTF_IN:NIPP_INDI_SMAL_1AOBL3E": "AMFI:118778",
    # Add more entries here as new assets are tracked:
    # "MUTF_IN:HDFC_MIDC_OPPO_7FXZJ7U": "AMFI:120503",
}
```

- Tickers **not** in the matrix are passed directly to `yfinance` (treated as NSE equity tickers).
- Tickers **prefixed with `AMFI:`** in the matrix value are resolved against the AMFI NAV database.
- New mutual funds are added by inserting one line into this dict — no other code changes required.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `COUCH_HOST` | `http://localhost:5984` | CouchDB server URL |
| `COUCH_USER` | *(required)* | CouchDB admin username |
| `COUCH_PASS` | *(required)* | CouchDB admin password |
| `COUCH_APP_USER` | *(unset)* | Optional. Restrict the sweep to a single user ID (handy for debugging). Leave unset to update **all** users. |

**`.env` file support:** Create a `.env` file in the same directory as the script to avoid setting environment variables manually every run.

```env
COUCH_HOST=http://localhost:5984
COUCH_USER=admin
COUCH_PASS=yourpassword
# COUCH_APP_USER=Sanguinius   # optional — restrict to one user; unset sweeps all users
```

**Systemd service setup (Raspberry Pi):**

```ini
[Unit]
Description=Auspex Market Data Daemon
After=network.target

[Service]
ExecStart=/usr/bin/python3 /home/pi/auspex_daemon.py
Restart=always
RestartSec=30
Environment=COUCH_HOST=http://localhost:5984
Environment=COUCH_USER=your_user
Environment=COUCH_PASS=your_pass

[Install]
WantedBy=multi-user.target
```

Enable with:
```bash
sudo systemctl enable auspex
sudo systemctl start auspex
```

**Python dependencies:**
```
requests
yfinance
```

---

### 8.2 Migration Script (`import.py`)

`import.py` is a **one-time data migration script** used to transfer historical financial data from the previous legacy system into the current Codex Tributorum database schema. It reads the older data format, transforms it into the namespaced PouchDB document model, and writes the results to CouchDB.

This script is not part of the day-to-day application workflow. It was run once during the initial migration and is preserved in the repository as a record of the transformation logic and as a reference if a re-import is ever needed.

**When to use it:** Only if you need to re-seed the database from the legacy data source, or if you are setting up the application on a new CouchDB instance and want to restore historical records from the old system.

---

## 9. Cross-Platform Targets

### 9.1 Android (Capacitor)

**Config file:** `capacitor.config.json`

```json
{
  "appId": "com.Sanguinius",
  "appName": "Codex Tributorum",
  "webDir": "dist",
  "android": { "allowMixedContent": true }
}
```

- `webDir: "dist"` — Capacitor copies the Vite build output into the Android project.
- `allowMixedContent: true` — allows PouchDB to connect to a non-HTTPS local CouchDB (e.g., a Raspberry Pi on the local network).

**Build & deploy:**
```bash
npm run build                    # Build Vite output
npx cap sync android             # Sync web assets to Android project
npx cap open android             # Open in Android Studio
# Then build APK/AAB from Android Studio
```

The `android/` directory contains the native Android project managed by Capacitor.

---

### 9.2 Web (PWA / Service Worker)

**Service worker:** `public/sw.js`

Registered in `main.jsx` on the `load` event. Enables offline-first behaviour — the app shell and static assets are cached so the app continues to function without an internet connection. PouchDB data is always available locally regardless of network state.

**Build & serve:**
```bash
npm run build      # Outputs to dist/
npm run preview    # Local preview of production build
```

---

## 10. Authentication & Boot Flow

The Boot Screen (`BootScreen.jsx` on desktop, `MobileBootScreen.jsx` on mobile) is the app's credential entry point. It collects:

| Field | Purpose |
|-------|---------|
| **Username** | Used as the `userId` to namespace all database documents (e.g., `txn:Sanguinius:...`). This allows multiple users to share a single CouchDB instance without data collision. |
| **CouchDB Host** | Optional. If provided, the app opens bidirectional live replication to the remote server after boot. If omitted, the app runs fully locally using PouchDB only. |
| **Password** | CouchDB authentication credential for the provided host. |

These credentials are held in React state (`credentials`) in `App.jsx` and passed to `useFinanceData()`, which uses them to initialize the databases and optionally start sync.

**This is not a traditional authentication system** — the app does not validate credentials against a local user store. The username is a namespace token; the password is only used to authenticate against the remote CouchDB server if a host is provided. Running the app without a host bypasses any password check entirely.

**Multiple users on one device:** Because all documents are namespaced by `userId`, multiple users can exist on the same CouchDB instance. However, on a single device with a local-only PouchDB setup, all users share the same physical database files — the `userId` prefix is the only separation.

---

## 11. Getting Started

### Prerequisites

- **Node.js** v18+ and **npm**
- **Python** 3.8+ (for backend scripts)
- **CouchDB** (optional, for sync — local or remote)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Athangk169/Codex-Tributorum.git
cd Codex-Tributorum

# 2. Install Node dependencies
npm install

# 3. Install Python dependencies (for backend scripts)
pip install requests yfinance
```

### Development

```bash
npm run dev        # Start Vite dev server (default: http://localhost:5173)
```

### Production Build

```bash
npm run build      # Outputs to dist/
```

### First-Time Setup (with Migration)

If migrating from the legacy system, run the import script once before starting the app:

```bash
# Set your CouchDB credentials and run the migration
COUCH_HOST=http://localhost:5984 \
COUCH_USER=admin \
COUCH_PASS=password \
python3 import.py
```

This populates the databases with historical data. Subsequent app launches will read from the existing database — the migration script does not need to be run again.

### Starting the Market Data Daemon

```bash
# Create a .env file with your credentials
cat > .env <<EOF
COUCH_HOST=http://localhost:5984
COUCH_USER=admin
COUCH_PASS=password
COUCH_APP_USER=Sanguinius
EOF

# Run the daemon
python3 auspex_daemon.py
```

---

## 12. Configuration Reference

### `vite.config.js`

```js
export default defineConfig({
  plugins: [react()],
  base: './',             // Relative paths — required for Capacitor Android WebView
  define: {
    global: 'window',     // PouchDB compatibility shim
  },
})
```

- `base: './'` — ensures all asset paths are relative, required for Capacitor's Android WebView.
- `global: 'window'` — PouchDB expects a Node.js `global` object; this shim provides it in the browser environment.

### `capacitor.config.json`

```json
{
  "appId": "com.Sanguinius",
  "appName": "Codex Tributorum",
  "webDir": "dist",
  "android": { "allowMixedContent": true }
}
```

### `eslint.config.js`

Extends `@eslint/js` recommended rules with React Hooks and React Refresh plugins. Targets browser and ES2020+ globals.

---

## 13. Document ID Conventions

All PouchDB/CouchDB documents use a namespaced ID scheme for clarity and to enable efficient prefix-based range queries (`startkey` / `endkey`):

| Pattern | Database | Description |
|---------|----------|-------------|
| `txn:{userId}:{YYYY-MM-DD}:{suffix}` | `finances` | Financial transaction |
| `finance:account:{userId}:{accountId}` | `metadata` | Bank account |
| `finance:card:{userId}:{cardId}` | `metadata` | Credit card |
| `finance:rule:{userId}:{categorySlug}` | `metadata` | Auto-categorization rule |
| `finance:config:categories:{userId}` | `metadata` | User category configuration |
| `finance:config:routes` | `metadata` | Transfer routing table |
| `finance:config:analytics` | `metadata` | Analytics settings |
| `finance:snapshot:{userId}:{YYYY-MM}` | `metadata` | Monthly balance snapshot |
| `finance:investments:current:{userId}` | `investments_vault` | Live investment manifest |
| `finance:investments:snapshot:{userId}:{YYYY-MM}` | `investments_vault` | Monthly investment snapshot |

This convention enables efficient PouchDB queries like:
```js
metadataDB.allDocs({
  include_docs: true,
  startkey: `finance:rule:${userId}:`,
  endkey:   `finance:rule:${userId}:\uffff`
})
```
which fetches all category rules for a specific user in a single database scan without a secondary index.

---

*Documentation generated from source analysis of [Codex Tributorum](https://github.com/Athangk169/Codex-Tributorum) — May 2026*
