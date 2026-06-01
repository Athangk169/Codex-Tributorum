# Codex Tributorum

A personal finance dashboard themed as an Adeptus Mechanicus cogitator — Warhammer 40K
visuals over a real PouchDB ↔ CouchDB sync engine. Runs on the desktop browser via
Tailscale and as an Android app via Capacitor. Designed for a single owner with a small
circle of trusted users on the same tailnet.

```
┌─────────────────┐         tailnet (HTTPS)         ┌──────────────────────┐
│  Android (APK)  │ ─── https://laptop.ts.net ──▶  │   Laptop (Windows)   │
│  ┌───────────┐  │                                 │  ┌────────────────┐  │
│  │ PouchDB   │◀─┼────── live two-way sync ───────┤  │   CouchDB :5984│  │
│  └───────────┘  │                                 │  └─────▲──────────┘  │
│  Capacitor      │                                 │        │ proxy       │
│  WebView        │                                 │  tailscale serve     │
└─────────────────┘                                 │  /  → dist/ files    │
                                                    │  /db → CouchDB :6984 │
┌─────────────────┐                                 └──────────────────────┘
│ Desktop browser │ ── https://laptop.ts.net ─────────┘
│   PouchDB       │
└─────────────────┘
```

## What this is

- React 19 SPA built with Vite 8.
- Local-first data: every client keeps a full PouchDB replica in IndexedDB. Works
  offline; resumes sync the moment the tailnet comes back.
- One CouchDB instance on the host laptop is the source of truth.
- No public internet exposure. Tailscale enforces who can reach the server.
- All currency display stripped — pure numbers, no symbols.

## Quick start (first-time setup on a new machine)

```powershell
git clone <repo> finance-dashboard
cd finance-dashboard
npm install
npm run dev           # http://localhost:5173 for hot-reload dev
```

For production-style usage on the tailnet you don't run `npm run dev` — you build once
and let `tailscale serve` host the files:

```powershell
npm run build         # produces dist/
tailscale serve --bg --set-path=/ "<absolute-path>\dist"
tailscale serve --bg --set-path=/db https+insecure://localhost:6984
```

(Run those `tailscale serve` lines from an **elevated** PowerShell — on Windows,
serving a filesystem path requires local admin.)

## Documentation map

| Doc | When you need it |
|---|---|
| **[OPERATIONS.md](OPERATIONS.md)** | "How do I back up?" "Tailscale is acting up." "Add a friend." Day-to-day runbook. |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | "How does sync work?" "Where does X live in the code?" Stack and data model reference. |
| **[MIGRATION.md](MIGRATION.md)** | Moving CouchDB to an external SSD, then later to a Raspberry Pi. |
| [android/RELEASE_SIGNING.md](android/RELEASE_SIGNING.md) | Building a signed release APK. One-time keystore setup. |
| [android/HTTPS_MIGRATION.md](android/HTTPS_MIGRATION.md) | Historical: how the cleartext-over-tailnet-IP setup got upgraded to HTTPS via `tailscale serve`. Kept for context; the current setup is the post-migration one. |

## Common commands

```powershell
# Dev
npm run dev               # vite dev server, port 5173

# Build + deploy to tailnet (laptop hosting)
npm run build             # rebuilds dist/

# Build + deploy to Android
npm run build
npx cap sync android      # copies dist/ into android/app/src/main/assets/public/
# then open Android Studio → Build → Build APK(s)

# Tailscale serve introspection
tailscale serve status
tailscale serve status --json > backup.json
```

## Tech stack

- **React 19** + **Vite 8** (SWC plugin) — UI
- **Capacitor 8** + **@aparajita/capacitor-biometric-auth** — Android wrapper + fingerprint gate
- **PouchDB 9** ↔ **CouchDB 3** — local-first sync
- **Tailscale** — network perimeter + HTTPS termination via ACME
- **@google/model-viewer** — 3D servo-skull on the overview
- Self-hosted Fira Code + Share Tech Mono fonts — no Google Fonts round-trip

## Security model — TL;DR

- Tailnet-only network access. No public exposure. ACL restricts shared friends to port 443.
- HttpOnly `AuthSession` cookie for auth — password never lives in JS state past boot.
- App-level user-ID filtering via PouchDB key prefixes (`txn:<user>:...`) — users don't see
  each other's data in the UI.
- See [ARCHITECTURE.md § Security](ARCHITECTURE.md#security-model) for the full picture.

## License

Personal project. Not licensed for redistribution.
