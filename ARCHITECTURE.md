# Architecture

Reference doc — what's in the codebase, how the pieces fit, the data model, the
sync flow, the security model. Read [OPERATIONS.md](OPERATIONS.md) for runbook
tasks; read this when you need to understand *why* something is the way it is.

---

## 1. Stack

```
                   ┌────────────────────────────────┐
                   │   React 19 + Vite 8 (SWC)      │  source of truth: src/
                   │   ↓ build                       │
                   │   dist/  (static SPA)           │  served as-is
                   └────────────────────────────────┘
                                  │
              ┌───────────────────┴────────────────────┐
              │                                        │
       ┌──────▼──────┐                          ┌──────▼──────┐
       │  Tailscale  │  (file mode at /,        │  Capacitor  │  (Android)
       │   serve     │   proxy at /db)          │   WebView   │  bundles dist/
       └──────┬──────┘                          └──────┬──────┘
              │                                        │
              ▼                                        ▼
       ┌─────────────┐                          ┌─────────────┐
       │   Browser   │  PouchDB ↔ IndexedDB     │  Android    │  PouchDB ↔ IndexedDB
       │   (client)  │                          │  (client)   │  + biometric gate
       └──────┬──────┘                          └──────┬──────┘
              │            HTTPS over tailnet          │
              └───────────────────┬────────────────────┘
                                  │
                          ┌───────▼───────┐
                          │  CouchDB 3    │  source of truth for data
                          │  on laptop    │
                          └───────────────┘
```

**Key principle: local-first.** Every client keeps a full PouchDB replica in
IndexedDB. The UI reads from PouchDB, never directly from CouchDB. PouchDB syncs
bidirectionally with CouchDB whenever it can; when it can't, the app keeps
working from the local replica.

## 2. Source tree

```
src/
├── main.jsx              # entry point. SW registration (PROD-only). One-shot
│                           cleanup of legacy mech_auth_token key.
├── App.jsx               # top-level routing. Boot vs Mobile vs Desktop branches.
│                           Holds credentials state (username only, post-boot).
│
├── hooks/
│   ├── useFinanceData.js # PouchDB lifecycle + sync wiring. The most important
│   │                       hook in the app. Owns syncLed state.
│   ├── useIsMobile.js    # viewport breakpoint at 768px
│   └── useRulesAndCategories.js
│
├── utils/
│   ├── engine.js         # all read/write business logic — 10 named engines.
│   │                       See § 4. Engine modules.
│   ├── couchAuth.js      # /_session POST/DELETE wrappers
│   ├── audioCore.js      # BGM + SFX
│   └── slideOrder.js     # nav order → direction calc (forward/backward swipes)
│
├── components/
│   ├── CrtShell.jsx      # desktop frame with CRT effects
│   │
│   ├── layout/
│   │   ├── BiometricGate.jsx   # Android resume lock via @aparajita plugin
│   │   ├── BootScreen.jsx      # desktop login + boot terminal
│   │   ├── ImperialHeader.jsx  # desktop top bar (KPIs marquee)
│   │   ├── TacticalNav.jsx     # desktop slide nav
│   │   ├── SystemFooter.jsx    # desktop footer
│   │   ├── CrtAmbient.jsx      # scanlines/flicker layer (z 9500)
│   │   ├── TimeOfDayTint.jsx   # day/night colour overlay (z 9998)
│   │   ├── IdleLitanyOverlay.jsx  # 20s-idle prayer scroll (z 9999)
│   │   ├── SwUpdateBanner.jsx  # service worker update prompt (z 10000)
│   │   └── ...
│   │
│   ├── shared/
│   │   ├── ScrambleText.jsx    # canonical scramble-resolve text. Used by
│   │   │                         every slide for numeric reveals.
│   │   ├── LoreTicker.jsx      # rotating quote ticker
│   │   ├── SlideTransition.jsx # scan-wipe between slides
│   │   ├── SlideErrorBoundary.jsx  # per-slide crash isolation
│   │   ├── HeartbeatTrace.jsx  # SVG pulse line
│   │   ├── NumberTick.jsx      # animated number counter
│   │   └── loreQuotes.js       # corpus for LoreTicker
│   │
│   ├── slides/                 # desktop slides
│   │   ├── OverviewSlide.jsx
│   │   ├── LedgerSlide.jsx
│   │   ├── AuspexSlide.jsx       (investments)
│   │   ├── LiquiditySlide.jsx    (credit cards)
│   │   ├── BankAccountsSlide.jsx
│   │   ├── ObligationsSlide.jsx  (loans + recurring + EMIs)
│   │   └── HoloSlide.jsx         (3D scene + category rules)
│   │
│   └── mobile/                 # mobile shell + mirrored slides
│       ├── MobileShell.jsx, MobileHeader.jsx, MobileNav.jsx,
│       │  MobileBootScreen.jsx
│       └── slides/
│           ├── MobileOverview.jsx, MobileLedger.jsx, MobileAuspex.jsx,
│           │  MobileLiquidity.jsx, MobileBank.jsx, MobileHolo.jsx
│
└── styles/
    ├── GlobalStyles.css   # design tokens (CSS vars) + @font-face for the
    │                        self-hosted fonts + global animations.
    └── index.css

public/
├── fonts/                 # Fira Code + Share Tech Mono (self-hosted)
├── sounds/                # bgm, click, holo SFX
├── servo-skull_warhammer.glb   # overview 3D model
├── holo/                  # three.js scene assets (Terra/Baal holos)
├── three.min.js           # local copy — no CDN
└── sw.js                  # service worker (cache + offline)
```

## 3. Slide rendering & navigation

[App.jsx](src/App.jsx) does the desktop-vs-mobile split. Each slide is wrapped in a
`<SlideErrorBoundary>` so one crashing slide can't black-screen the whole app.

Slide order lives in [src/utils/slideOrder.js](src/utils/slideOrder.js). Switching
slides goes through `setActiveSlide(slide)`; `directionBetween(prev, next)` decides
whether `SlideTransition` plays the forward (right→left) or backward (left→right)
scan-wipe.

Mobile has **no Obligations slide** — desktop-only. Everything else is
1-to-1 mirrored.

## 4. Engine modules

[src/utils/engine.js](src/utils/engine.js) — ~2100 lines, ten named engines.
The slides never query PouchDB directly; they go through engines.

| Engine | What it does |
|---|---|
| `CategorizationEngine` | Resolves a transaction's category by matching its description against keyword rules. Seeds obligation rules on first run. |
| `TransferEngine` | Detects inter-account transfers (so they don't pollute income/expense totals). |
| `CardEngine` | Builds the per-card "buckets" (statement periods → outstanding/paid). |
| `ProvisionEngine` | Tracks money set aside for future spends. |
| `AREngine` / `FinanceEngine.getARByTag` | Reimbursable receivables by tag. |
| `FinanceEngine` | The big one — reconstructs monthly balances, gross income, gross expense, net income, net spend. Also bank account live balances. |
| `TemporalEngine` | Ledger queries by month. |
| `AnalyticsEngine` | Multi-month trends. |
| `AccountEngine` | CRUD for accounts and cards. |
| `ObligationsEngine` | Recurring expenses + loans + EMIs roll-up. |

**Every** `allDocs` call is scoped to `startkey: \`txn:${userId}:\`` (or the
equivalent for `finance:rule:`, `finance:account:`, etc.). This is what enforces
per-user isolation in the UI — even though Alice's PouchDB has Bob's docs sitting
in IndexedDB, no engine query can return them.

The single exception is in [useFinanceData.js:136](src/hooks/useFinanceData.js#L136)
(`seedInitialCategoriesFromAdmin`) — that intentionally scans across users to copy
the `Sanguinius` admin's category rules into a new user's namespace on first login.

## 5. Data model

### Document IDs encode the user

```
txn:<user>:<YYYY-MM-DD>:<8-char-suffix>      // transactions
finance:rule:<user>:<category-slug>          // categorisation rules
finance:account:<user>:<account-id>          // accounts
finance:card:<user>:<card-id>                // cards
finance:recurring:<user>:<recurring-id>      // recurring obligations
finance:loan:<user>:<loan-id>                // loans
finance:emi:<user>:<emi-id>                  // EMIs (instalment purchases)
finance:provision:<user>:<provision-id>      // earmarked funds
finance:snapshot:<user>:<YYYY-MM>            // month boundary snapshots
finance:config:categories:<user>             // per-user category-type config
finance:investments:current:<user>           // investment manifest
```

User scope is in **the key**, not just an internal `user_id` field. This is why
range queries (`startkey`/`endkey`) work for per-user isolation.

### Three databases

- **`finances`** — only transactions. All other types live in metadata. This is the
  hot, write-heavy DB.
- **`metadata_vault`** — accounts, cards, rules, recurring, loans, EMIs, provisions,
  snapshots, config. Mostly read.
- **`investments_vault`** — investment portfolio. Separate so it can be deleted/reset
  without nuking everything.

## 6. Sync flow

```
┌──────────────────────┐               ┌──────────────────────┐
│   Local PouchDB      │               │      CouchDB         │
│  (IndexedDB)         │               │   (laptop, :6984)    │
└──────────┬───────────┘               └──────────┬───────────┘
           │                                      │
           │  db.sync(remote, { live, retry })    │
           │ ◄──────────────────────────────────► │
           │                                      │
       ┌───┴────┐                              ┌──┴──┐
       │ writes │                              │ reads/
       │ trigger│                              │ writes/
       │ change │                              │ design
       │ events │                              │ docs   │
       └───┬────┘                              └────────┘
           │
           ▼
   debouncedRefresh()
   → re-run engine queries
   → setFinanceData(newState)
```

[src/hooks/useFinanceData.js](src/hooks/useFinanceData.js) is the entire sync layer.
It:

1. Opens three local PouchDB instances (`finances`, `metadata_vault`,
   `investments_vault`).
2. For each, opens a sync to the remote URL `https://<host>/db/<dbName>` using a
   custom `fetch` that sends `credentials: 'include'` (carries the AuthSession cookie).
3. Subscribes to `'change'`, `'paused'`, `'error'`, `'denied'` on each sync, which
   drive the `syncLed` state ('ok' / 'warn' / 'offline' / 'error').
4. Also subscribes to local PouchDB `.changes({ live: true, since: 'now' })` — so
   any local write triggers a refresh, even when offline.
5. Runs a 4s-timeout probe against `<host>/db/` on mount and every 15s, to detect
   "tailscale off / laptop unreachable" much faster than PouchDB's TCP timeouts.
6. Listens to `window.online` / `window.offline` events for instant device-level
   connectivity flips.

`syncLed` shows up in the Overview's "SYSTEM UPLINK" panel as:
- `ESTABLISHED` (green) — `ok`
- `AWAITING` (amber) — `warn`
- `NO SIGNAL` (red) — `offline`
- `SEVERED` (red) — `error`

## 7. Offline behaviour

Because the UI reads only from PouchDB and PouchDB never blocks on the network:

- **Writes while offline** → PouchDB stores them locally. The local `.changes()`
  feed fires → `debouncedRefresh` re-runs the engines → UI updates instantly.
- **Reads while offline** → served from the local replica. No spinner, no error.
- **Reconnection** → `db.sync(remote, { retry: true })` retries on backoff. As
  soon as CouchDB is reachable, queued writes push and any remote changes pull.
  Both clients re-render via their `'change'` handlers.

Service worker (`public/sw.js`, registered in `main.jsx` for PROD only) caches the
shell assets (HTML/JS/CSS/fonts/sounds/3D model) so cold loads work even with no
network.

## 8. Auth flow

1. **BootScreen** ([src/components/layout/BootScreen.jsx](src/components/layout/BootScreen.jsx))
   collects username + password.
2. Calls `couchLogin(host, user, pass)` →
   [src/utils/couchAuth.js](src/utils/couchAuth.js) → `POST /db/_session`.
3. CouchDB validates, responds with `Set-Cookie: AuthSession=...; HttpOnly; Secure`.
4. Browser stores the cookie scoped to the tailnet origin.
5. `onComplete({ username })` — password is *not* passed up; the cookie is enough.
6. App.jsx stores only `{ username }` in `credentials` state.
7. Every subsequent PouchDB sync request goes through `cookieFetch` with
   `credentials: 'include'` → cookie attached → CouchDB authorises.

The password lives **only inside BootScreen's local React state**, which gets
unmounted the moment boot completes. It's never persisted, never lives on disk,
never enters App-level state.

Cached username (UX prefill only) lives in `localStorage` as `mech_username`.

## 9. Security model

| Layer | What it prevents |
|---|---|
| **Tailscale ACL** (`autogroup:shared → tag:couch-server:443` only) | A shared friend can only reach port 443 of the laptop. Can't probe SMB, RDP, raw CouchDB, or peer devices. |
| **HTTPS via tailscale serve** | All app↔server traffic encrypted with a real ACME-issued cert bound to the MagicDNS hostname. |
| **CouchDB `members.names`** | Only listed CouchDB users can access the three DBs. Anyone else gets 403. |
| **App-level user-ID filtering** | Engine queries use key-range prefixes (`txn:<user>:...`). Even though clients hold a full PouchDB replica, the UI can only render their own docs. |
| **HttpOnly `AuthSession` cookie** | Password never lives in JS state past boot. A future XSS could ride the cookie but not exfiltrate the password. |
| **Android: `allowBackup=false`** + data-extraction rules + R8 minify + release-signed APK | Local data can't be slurped via adb backup / Google Drive auto-backup. |
| **Service worker registered for PROD only** | Dev server's HMR endpoints aren't intercepted by a stale cache. |

**Trust model**: 3-5 friends on a tailnet, each with their own CouchDB user. The
app UI keeps their data separate; their local PouchDB replicas physically contain
everyone's data (PouchDB replicates the whole DB, not a filtered view). For the
stated threat model this is acceptable — friends don't poke at IndexedDB out of
malice. If the trust assumption ever changes, see
[MIGRATION.md § Per-user databases](MIGRATION.md) (TODO — not yet documented).

**Compromise response**: remove the friend from the tailnet (one click in the admin
console). They lose the network path immediately; CouchDB cleanup is hygiene.

## 10. Build & deployment

```
src/ + public/ ──[vite build]──► dist/  ──┬──► tailscale serve --set-path=/ ──► browser
                                          │
                                          └──[cap sync android]──► android/app/src/main/assets/public/
                                                                     │
                                                                     └──[Android Studio]──► APK
```

- **`npm run dev`** — vite dev server, port 5173. No SW. HMR.
- **`npm run build`** — produces `dist/`. The tailscale serve config reads files
  from `dist/` directly, so no service restart needed.
- **`npx cap sync android`** — copies `dist/` into the Android assets folder, plus
  refreshes Capacitor plugin native code.
- **Android Studio** then builds either:
  - Debug APK — quick, debug-keystore signed, not for production.
  - Release APK / Bundle — uses the real keystore (see
    [android/RELEASE_SIGNING.md](android/RELEASE_SIGNING.md)), R8 minified.

## 11. Notable design choices that aren't obvious

- **All `<style>` tags inline in JSX.** No CSS-in-JS library. Each slide owns its
  own scoped class names (`ov-*` for OverviewSlide, `mo-*` for mobile, `mb-*` for
  bank, etc.). The convention is "first 2-3 letters of the slide".
- **No state management library.** React state + hooks only. `useFinanceData`
  returns everything needed; slides drill props from `App.jsx`.
- **Custom number-scrambling animation** ([ScrambleText](src/components/shared/ScrambleText.jsx))
  resolves random chars into the final value. Speed/step props let each slide pick
  fast (for live values) or slow (for hero numbers).
- **Z-index hierarchy** is deliberate:
  - 1000: tickers, mobile nav
  - 9500: CrtAmbient (scanlines)
  - 9998: TimeOfDayTint
  - 9999: IdleLitanyOverlay (also maximised Holo viewport — they collide
    intentionally, Holo wins by being later in DOM)
  - 10000: SwUpdateBanner, BootScreen
  - 10001: BiometricGate (highest — lockouts override everything)
- **Service worker only in PROD.** Saves a lot of confusion in dev where HMR
  endpoints would fail the SW's cache-then-network fallback.
