# Codex Tributorum — Comprehensive Documentation

> **App ID:** `com.Sanguinius` | **Version:** `0.0.0` | **Stack:** React 19 + Vite + PouchDB + Electron + Capacitor

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
14. [User Manual](#14-user-manual)
15. [Setup Guides](#15-setup-guides)
16. [How the Code Works](#16-how-the-code-works)
17. [EMI Operating Guide](#17-emi-operating-guide)
18. [Troubleshooting](#18-troubleshooting)

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
│       └── audioCore.js         # BGM and SFX audio system
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
   - `metadata_vault` — accounts, cards, categories, rules, routes, configs
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
| `obligations` | `ObligationsSlide` | *(desktop only)* | Recurring expenses, EMI purchases |

### HoloSlide — 3D & Holographic Display

The `HoloSlide` (and its mobile counterpart `MobileHolo`) is the app's signature visual centrepiece. It combines:

- **HTML holograms** — CSS/animation-driven holographic UI panels styled to match the Imperial aesthetic
- **3D model viewer** — Uses the `@google/model-viewer` web component to render `.glb` 3D models directly in the browser. Models are interactive (rotate, pan, zoom) and work across all three platforms (web, Electron, Android) since `<model-viewer>` is a standard web component.

The `@google/model-viewer` version `^4.2.0` supports augmented reality (AR) on Android, which can optionally be enabled in the Capacitor build.

### Desktop Layout Components

| Component | Role |
|-----------|------|
| `CrtShell` | Root wrapper applying the CRT monitor visual effect (scanlines, screen curvature) |
| `BootScreen` | Login / credential entry screen shown before the app loads |
| `ImperialHeader` | Top bar with net worth metrics, sync LED, and user callsign |
| `TacticalNav` | Horizontal navigation bar for switching slides |
| `SystemFooter` | Bottom status bar |

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

### `metadata_vault` (Configuration Database)

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
COUCH_APP_USER=Sanguinius
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
  base: './',             // Relative paths — required for Electron file:// loading
  define: {
    global: 'window',     // PouchDB compatibility shim
  },
})
```

- `base: './'` — critical for Electron; ensures all asset paths are relative.
- `global: 'window'` — PouchDB expects a Node.js `global` object; this shim provides it in the browser/Electron environment.

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
| `finance:account:{userId}:{accountId}` | `metadata_vault` | Bank account |
| `finance:card:{userId}:{cardId}` | `metadata_vault` | Credit card |
| `finance:rule:{userId}:{categorySlug}` | `metadata_vault` | Auto-categorization rule |
| `finance:config:categories:{userId}` | `metadata_vault` | User category configuration |
| `finance:config:routes` | `metadata_vault` | Transfer routing table |
| `finance:config:analytics` | `metadata_vault` | Analytics settings |
| `finance:snapshot:{userId}:{YYYY-MM}` | `metadata_vault` | Monthly balance snapshot |
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

## 14. User Manual

This section explains how to use Codex Tributorum as an everyday finance app.

### 14.1 Boot and Login

When the app opens, the boot screen asks for a username and CouchDB credentials.

| Field | What to Enter | Notes |
|-------|---------------|-------|
| Username | Your app user ID, e.g. `Sanguinius` | This namespaces your data. It is case-sensitive in document IDs. |
| Host / Uplink | CouchDB host such as `192.168.29.100:5984` | The app chooses `https://` for `ts.net` hosts and `http://` for local IPs. |
| Password | CouchDB password | Used only for remote sync. Local PouchDB still works offline. |

If the CouchDB host is unavailable, the app continues using local data and shows an offline/warn sync state. Local writes sync later when the remote host is reachable.

### 14.2 Overview

Use the Overview slide for net worth, cash position, income, expenses, savings rate, recent activity, and monthly trend summaries. The numbers are derived from transactions, account metadata, card buckets, and investment manifests. If an overview number looks wrong, first check the Ledger category, account, and sign of the underlying transactions.

### 14.3 Ledger

The Ledger is the source of truth for day-to-day transactions.

Common workflow:

1. Add a transaction with date, amount, description, account type, sub-account, and category.
2. Let the categorization engine suggest a category from keyword rules.
3. Correct the category if needed.
4. For EMI transactions, link the transaction to the relevant EMI record.
5. Edit transaction principal/interest splits when bank statements provide exact values.

Amount convention:

- Income and inflows are positive.
- Expenses and outflows are negative.

### 14.4 Holo Category Rules

The Holo slide manages auto-categorization rules. Each category has a category name, a type (`income`, `neutral`, or `expense`), and a keyword list.

When a transaction description contains a keyword, the category engine assigns that category. Longer matching keywords win first, which helps avoid broad keywords overriding specific ones.

New-user seeding:

- On first login, the app copies Sanguinius/admin category rules into the new user's `finance:rule:{userId}:...` namespace.
- It also creates or merges `finance:config:categories:{userId}`.
- Desktop and mobile Holo reload after finance data refreshes so seeded rules appear without a manual restart.

### 14.5 Bank and Credit Cards

Use the Bank slide to define bank accounts, cash accounts, credit cards, default accounts/cards, billing days, due days, card limits, and card payment buckets.

Credit card buckets are built from card billing configuration and tagged card transactions. Card payments reduce outstanding bucket balances.

### 14.6 Liquidity

Liquidity is for near-term cash planning. It combines account balances, expected obligations, card dues, and scheduled/recurring items to show upcoming pressure on cash.

### 14.7 Auspex Investments

Auspex reads the investment manifest from `investments_vault`. The market daemon updates prices every 15 minutes when running. The frontend does not fetch live market prices directly; it reads locally synced PouchDB/CouchDB documents.

Typical workflow:

1. Add or update holdings in the investment manifest.
2. Add aliases in `auspex_daemon.py` for mutual funds or unusual tickers.
3. Run the daemon on the CouchDB host.
4. Let the frontend sync `investments_vault`.

### 14.8 Obligations

The Obligations slide tracks recurring expenses and consumer EMI purchases. Recurring expenses are matched against ledger transactions inside the current billing cycle. EMI purchases are calculated from metadata plus tagged transactions.

---

## 15. Setup Guides

### 15.1 Local Development Setup

```powershell
npm install
npm.cmd run dev
```

Vite starts a local development server, normally at `http://localhost:5173`. If PowerShell blocks `npm`, use `npm.cmd`.

### 15.2 Production Web Build

```powershell
npm.cmd run build
npm.cmd run preview
```

Build output is written to `dist/`.

Known build warnings:

- Large chunk warnings are expected because the app bundles a substantial UI and model-viewer runtime.
- `/parchment.jpg` may be reported as unresolved at build time if referenced as a runtime/public asset.
- The Vite React SWC plugin may warn about a deprecated internal option. This does not currently block builds.

### 15.3 Android Build

```powershell
npm.cmd run build
npx cap sync android
npx cap open android
```

Then build and deploy from Android Studio.

Important Android notes:

- `capacitor.config.json` points `webDir` to `dist`.
- `allowMixedContent: true` permits local HTTP CouchDB sync on a trusted LAN.
- Always run `npx cap sync android` after rebuilding the web app.

### 15.4 CouchDB Setup

Create three CouchDB databases:

- `finances`
- `metadata_vault`
- `investments_vault`

The app syncs PouchDB databases with those remote names. The CouchDB user entered at boot must be allowed to read and write each database.

For a local LAN host, the app builds URLs like:

```text
http://192.168.29.100:5984/finances
http://192.168.29.100:5984/metadata_vault
http://192.168.29.100:5984/investments_vault
```

For a Tailscale hostname containing `ts.net`, it uses `https://`.

### 15.5 New User Setup

On first login for a non-admin user:

1. `useFinanceData` opens local PouchDB databases.
2. Live sync starts if CouchDB is reachable.
3. Category rules are seeded from Sanguinius/admin rules.
4. The `EMI Payment` obligation category is ensured.
5. Finance data is reconstructed and passed to slides.

If a new user has no categories in Holo, check that the Sanguinius/admin source rules exist and that metadata sync has completed.

### 15.6 Market Daemon Setup

Install Python dependencies:

```powershell
pip install requests yfinance
```

Create `.env`:

```env
COUCH_HOST=http://localhost:5984
COUCH_USER=admin
COUCH_PASS=password
COUCH_APP_USER=Sanguinius
```

Run:

```powershell
python auspex_daemon.py
```

The daemon should run on a machine that can reach CouchDB and the internet.

---

## 16. How the Code Works

### 16.1 Runtime Flow

1. `main.jsx` mounts React and registers the service worker.
2. `App.jsx` shows the desktop or mobile boot screen.
3. Boot completion stores credentials in React state.
4. `useFinanceData(credentials)` opens three PouchDB databases.
5. `useFinanceData` starts live CouchDB sync.
6. It seeds required category/obligation metadata.
7. It rebuilds a single `financeData` object.
8. `App.jsx` passes `financeData` and DB handles into slides.
9. Slides render read models and perform writes directly through engine methods.
10. Local DB changes trigger a debounced refresh.

### 16.2 Data Ownership

| Data | Database | Main Writer | Main Readers |
|------|----------|-------------|--------------|
| Transactions | `finances` | Ledger, obligations logging | FinanceEngine, AnalyticsEngine, CardEngine, ObligationsEngine |
| Accounts/cards | `metadata_vault` | Bank/Liquidity screens | FinanceEngine, CardEngine, AccountEngine |
| Category rules | `metadata_vault` | HoloSlide, seeder | CategorizationEngine, Ledger |
| EMIs | `metadata_vault` | ObligationsSlide | ObligationsEngine, Ledger |
| Investments | `investments_vault` | Auspex daemon / Auspex UI | Auspex slides |

### 16.3 Engine Boundaries

`src/utils/engine.js` is intentionally a collection of domain engines rather than React components. It contains the financial logic so UI code stays mostly about forms and presentation.

Current engine responsibilities:

- `CategorizationEngine`: category rules, keyword matching, category config writes.
- `TransferEngine`: category-to-account routing.
- `FinanceEngine`: balance reconstruction, cash/card/account state, AR/provisions.
- `CardEngine`: credit card cycles, due buckets, paid/outstanding calculations.
- `AnalyticsEngine`: monthly trends and category analytics.
- `AccountEngine`: account and card CRUD.
- `ObligationsEngine`: recurring expenses, EMI purchases.

### 16.4 Refresh and Sync Model

`useFinanceData` listens to both remote sync events and local PouchDB changes.

Why both matter:

- Remote sync events catch changes arriving from CouchDB.
- Local PouchDB changes catch offline writes immediately.
- A debounce prevents multiple rapid changes from causing excessive recomputation.

The frontend generally does not keep long-lived derived state inside individual slides. Instead, it refreshes `financeData` and slides re-render from that object.

### 16.5 Category Seeding Model

Category rules use the current schema:

```json
{
  "_id": "finance:rule:Sanguinius:groceries",
  "type": "finance:rule",
  "user_id": "Sanguinius",
  "category_name": "Groceries",
  "keywords": ["grocery", "supermarket"],
  "is_active": true
}
```

User category types are stored in:

```json
{
  "_id": "finance:config:categories:Sanguinius",
  "type": "finance:config",
  "user_id": "Sanguinius",
  "income_categories": ["Salary"],
  "neutral_categories": ["Credit Card Payment"],
  "expense_categories": ["Groceries", "Dining"]
}
```

Older `category_rule` and `config_category_types*` docs may still exist. The current code can read/copy from them during seed, but Holo writes the new `finance:*` schema.

### 16.6 Obligation Calculation Model

EMI purchases are modeled as metadata plus tagged ledger transactions. EMI metadata contains total amount, down payment, financed amount, EMI amount, tenure months, interest rate, account, purchase date, and first EMI date.

Tagged EMI transactions contain `EMI Payment`, `principal_component`, `interest_component`, and `emi_id`.

`getEMIBalance` derives months paid, outstanding balance, principal/interest paid, next due date, and projected payoff from the tagged payments. Stored principal/interest splits are honored when present.

### 16.7 Frontend Component Pattern

Desktop and mobile screens are parallel:

- Desktop slides live in `src/components/slides/`.
- Mobile slides live in `src/components/mobile/slides/`.
- Shared high-level routing happens in `App.jsx`.

Most write flows follow this pattern:

1. User submits a form.
2. Slide calls an engine method or writes a PouchDB document.
3. PouchDB emits a local change.
4. `useFinanceData` refreshes.
5. The UI re-renders with updated derived data.

---

## 17. EMI Operating Guide

### 17.1 EMI Purchases

Consumer EMI (instalment) purchases:

- Have a fixed financed amount (total amount minus down payment).
- Have a fixed EMI amount and tenure.
- Payments are tagged as `EMI Payment`.
- Principal/interest split is estimated by financed amount divided by total payable unless explicit components are stored.

Use EMI purchases for phones, appliances, and card-based instalment purchases.

### 17.2 Logging and Tracking

Declare an EMI purchase from the Obligations slide (OUTSTANDING DEBTS tab), then log each instalment as an `EMI Payment` linked to that EMI record. `getEMIBalance` updates months paid, outstanding balance, next due date, and projected payoff from the tagged payments.

---

## 18. Troubleshooting

### Holo shows no categories for a new user

Check:

1. The admin/source user has category rules.
2. Metadata sync has completed.
3. New-user seed created `finance:rule:{newUser}:...` docs.
4. The Holo slide has reloaded after `financeData` refresh.

The current seed path copies old or new admin category formats into the new `finance:rule` schema.

### Bank balances look wrong

Check transaction signs and account routing:

- Expenses should be negative.
- Income should be positive.
- Credit card payments should be outflows from bank accounts.
- Opening balances and historical imports should not duplicate current-state entries.

### Build works but lint fails

`npm.cmd run build` is the main production verification. The current lint command scans generated Android/build artifacts and older code paths, so it may report unrelated errors. Fix lint scope before treating it as a reliable project-wide gate.

### PowerShell blocks npm

Use:

```powershell
npm.cmd run build
npm.cmd run dev
```

instead of `npm run ...`.

---

*Documentation generated from source analysis of [Codex Tributorum](https://github.com/Athangk169/Codex-Tributorum) — May 2026*
