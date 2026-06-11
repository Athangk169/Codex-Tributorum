# Server Guide — Upgrades & Migration

How to move Codex Tributorum to a dedicated server, and how to move it again
every time hardware ages out — for the next 15–20 years. Supersedes the old
[MIGRATION.md](MIGRATION.md) SSD/Pi plan.

**The philosophy:** no machine lasts 20 years, so the *machine* is disposable
and the *system* is durable. The system is three things:

1. **Data** — the CouchDB databases, continuously replicated and backed up.
2. **Text** — everything in [deploy/](deploy/): one compose file, one
   Caddyfile, one Dockerfile. The server's entire configuration is in git.
3. **This runbook** — so any future migration is execution, not archaeology.

A migration done right takes ~30 minutes of work spread over a week of
parallel running. The first one (laptop → mini-PC) is the rehearsal for every
one after it.

---

## 1. Hardware — what to buy

**Target: a used corporate 1-litre mini-PC, 8th-gen Intel or newer.**

| Line | Budget tier | Premium tier (vPro remote mgmt) |
|---|---|---|
| Dell OptiPlex Micro | 3060 / 3070 / 3080 | 7060 / 7070 / 7080 |
| Lenovo ThinkCentre Tiny | M720q | M920q, M90q Gen 1–2 |
| HP Mini | ProDesk 400/600 G4–G6 | EliteDesk 800 G4–G6 |

Checklist when buying:

- [ ] CPU suffix **T** (35 W — cooler, quieter, longer-lived). i5-8500T class.
- [ ] 8–16 GB DDR4 (socketed; more can be added later).
- [ ] NVMe slot present. **Budget for a NEW SSD** (Crucial/Samsung/WD,
      500 GB is plenty) — never inherit a used boot drive.
- [ ] Correct power brick included (spares ≈ ₹500–800, keep one).
- [ ] BIOS password cleared — confirm before paying.
- [ ] Premium tier only: vPro/AMT works → remote BIOS access for a headless box.

On arrival: repaste the CPU, clean the fan, fit the new SSD.

**Buy two if the price is right.** One serves; one is the cold spare on the
shelf. Spare + backups + this runbook = no hardware failure costs more than
an hour.

---

## 2. OS install & base setup

Debian stable (or Ubuntu LTS), **headless** — no desktop environment.

```bash
# After base install, over SSH:
sudo apt update && sudo apt upgrade
sudo apt install -y curl git ufw unattended-upgrades cockpit

# Docker (official repo — distro packages lag)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
```

**BIOS settings** (one-time, attach a monitor or use vPro):

- AC Power Recovery / After Power Loss → **Power On** (survives outages)
- Wake-on-LAN → on (optional, lets you wake it remotely if ever suspended)

**Firewall** — everything admin-facing rides the tailnet, nothing listens to
the world:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow in on tailscale0        # all tailnet traffic
sudo ufw allow from 192.168.0.0/16 to any port 22   # LAN SSH as fallback
sudo ufw enable
```

**Unattended security updates** (Debian asks during install; otherwise):

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## 3. The stack

Everything lives in [deploy/](deploy/) and is started with one command. The
shape:

```
tailscale serve (TLS on :443, one proxy rule)
        │
        ▼
   Caddy :8080 ──── /        → static dist/  (gzip, cache headers)
        │      └─── /db/*    → CouchDB :5984
        │
   CouchDB (data in ./data/couchdb)
   Auspex daemon (prices, every 15 min)
   Uptime Kuma :3001 (monitoring, tailnet-only)
   Dockge :5001 (compose UI, tailnet-only)
```

Setup:

```bash
git clone https://github.com/Athangk169/Codex-Tributorum.git ~/codex
cd ~/codex/deploy
cp .env.example .env        # fill in CouchDB admin creds + daemon creds
# put the built dist/ at ~/codex/dist (see §7 Deploying the app)
docker compose up -d
```

Pin the CouchDB image tag in `docker-compose.yml` to the **exact version
running on the old server** before migrating (check Fauxton → top-right, or
`curl localhost:5984`). Upgrade CouchDB versions as a separate, deliberate
step *after* the migration settles — never during.

**Archive the images** once everything works, so the stack can be rebuilt
even if registries vanish:

```bash
docker save couchdb:<tag> caddy:2 louislam/uptime-kuma:1 | gzip > ~/codex-images.tar.gz
# copy to the backup SSD alongside data backups
```

---

## 4. Tailscale identity — the hostname swap

Clients (browsers, the APK, friends' devices) all point at
`laptop-lg23d2mc.taild8bd6e.ts.net`. The new server should **take over that
name** so nothing client-side changes:

1. `sudo tailscale up` on the new box — it joins under a temporary name.
2. Admin console → tag the new machine **`tag:couch-server`** (the ACL
   follows the tag automatically).
3. When ready to cut over: admin console → rename/remove the old laptop's
   machine entry, then rename the new machine to **`laptop-lg23d2mc`**.
   MagicDNS and the TLS cert follow the name.
4. Apply the serve config (one rule now — Caddy handles paths):

   ```bash
   sudo tailscale serve --bg 8080
   # verify: tailscale serve status   (syntax drifts between versions — check --help)
   ```

5. **Re-share with every friend.** Shares are pinned to the *node*, not the
   name — the old shares die with the old machine. Machines → new server →
   Share… per friend. (Lesson learned 2026-06-11: a share to a dead node
   identity fails with a connection timeout and a stale 100.x address on the
   friend's side.)

---

## 5. Data migration — replicate, never copy

CouchDB replication is version-tolerant and runs while both servers stay
live. Run on the **new** server (`OLD` = old server's URL, reachable over the
tailnet while both run):

```bash
NEW="http://admin:<newpass>@127.0.0.1:5984"
OLD="https://laptop-lg23d2mc.taild8bd6e.ts.net/db"   # old serve proxy
AUTH="oldadmin:<oldpass>"

for db in finances metadata_vault investments_vault _users; do
  curl -s -X POST "$NEW/_replicate" -H 'Content-Type: application/json' -d "{
    \"source\": {\"url\": \"$OLD/$db\", \"auth\": {\"basic\": {\"username\": \"${AUTH%%:*}\", \"password\": \"${AUTH#*:}\"}}},
    \"target\": \"$db\",
    \"create_target\": true,
    \"continuous\": true
  }"
done
```

`continuous: true` keeps the new server in sync for the whole parallel
week — writes to the old server keep flowing to the new one until cutover.

**Verify** before cutover — doc counts must match on both:

```bash
for db in finances metadata_vault investments_vault; do
  curl -s "$NEW/$db" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['db_name'], d['doc_count'])"
done
```

Re-apply database permissions (members) on the new server — `_security` is
per-database state that does **not** replicate. Use the loop in
[OPERATIONS.md §5b](OPERATIONS.md).

**Disaster-recovery note:** if the old server is already dead, any client
device can resurrect the data — PouchDB replicates *back* into a fresh
CouchDB. Open the app on the device with the freshest replica, keep it
online, and point a reverse replication at it. Slower, but total loss
requires losing the server *and* every phone/laptop replica at once.

---

## 6. Cutover

Run old and new in parallel for **about a week**:

- [ ] Continuous replication running, doc counts matching (§5)
- [ ] `_security` members re-applied on all three DBs
- [ ] App loads via the new server (test with its temporary hostname first)
- [ ] Login works (cookie auth → CouchDB on the new box)
- [ ] Auspex daemon writing prices (check Kuma heartbeat / manifest timestamps)
- [ ] Monitoring + alerts live (§8), backups running on the new box (§9)

Then, in order: stop writes for a minute (just don't use the app), confirm
final doc counts match, cancel the continuous replications, do the hostname
swap (§4 step 3–5), re-share with friends, and have every client do one
online visit so the service worker re-caches against the new server.

**Keep the old server intact but offline for a month** — it's the rollback.
Rollback = rename it back, re-apply its serve config, re-share. After a
month, wipe it; it becomes the test bench / backup-restore rehearsal machine.

---

## 7. Deploying the app to the server

`dist/` is built on whatever machine you develop on, then synced:

```bash
npm run build                                  # on the dev machine
rsync -av --delete dist/ server:~/codex/dist/  # Caddy picks it up instantly
```

(On Windows, `deploy/deploy.ps1` builds to a staging dir and syncs — avoids
the file-lock failures that plagued in-place builds on the laptop.)

The service worker handles client updates: next online visit fetches the new
`index.html`, the update banner prompts a reload. No server restart needed —
Caddy serves whatever is in the folder.

---

## 8. Monitoring — know before it breaks

Three layers plus a dead-man switch, all owner-only via the tailnet ACL:

| Tool | What it watches | Where |
|---|---|---|
| **Cockpit** | Host: disk SMART, CPU/RAM, journal, updates | `https://<server-tailscale-ip>:9090` |
| **Uptime Kuma** | Services: app URL 200, `/db/` 401, daemon + backup heartbeats | `http://<server-tailscale-ip>:3001` |
| **Dockge** | Containers: status, logs, restarts | `http://<server-tailscale-ip>:5001` |

Kuma checks to configure on first run:

1. HTTP — app URL, expect 200.
2. HTTP — `…/db/`, **expect 401** (Kuma supports "accepted status codes" —
   401 means CouchDB is up and demanding auth, which is healthy).
3. Push — Auspex daemon heartbeat (add a `requests.get(KUMA_PUSH_URL)` at the
   end of a successful sweep, URL in `.env`).
4. Push — backup job heartbeat (see §9).
5. Notification channel: ntfy or Telegram → your phone. **Without this, the
   dashboards are just procrastinated breakage-discovery.**

**Dead-man switch** (catches "the whole box died", outbound-only so the
tailnet stays sealed): make a free check at healthchecks.io, then:

```bash
crontab -e
*/5 * * * * curl -fsS -m 10 --retry 3 https://hc-ping.com/<your-uuid> >/dev/null
```

If the pings stop — power cut, dead PSU, crashed box — healthchecks emails
you within minutes.

---

## 9. Backups — the actual 20-year asset

Nightly, automated, heartbeat-monitored. CouchDB's files are append-only, so
a live file-level copy is crash-consistent and fine for this scale:

```bash
#!/usr/bin/env bash
# /usr/local/bin/codex-backup.sh  (cron: 30 2 * * *)
set -euo pipefail
DEST=/mnt/backup-ssd/codex                       # external SSD, backups ONLY
STAMP=$(date +%F)
mkdir -p "$DEST/$STAMP"
tar -czf "$DEST/$STAMP/couchdb-data.tar.gz" -C ~/codex/deploy/data couchdb
cp -r ~/codex/deploy/{docker-compose.yml,Caddyfile} "$DEST/$STAMP/" 2>/dev/null || true
ls -dt "$DEST"/*/ | tail -n +31 | xargs -r rm -rf --  # keep 30 days
curl -fsS -m 10 https://hc-ping.com/<backup-check-uuid> >/dev/null
```

Rules:

- **3-2-1**: live data (internal SSD) + nightly local (external SSD) +
  offsite (encrypted — `rclone` to any cloud, or a relative's machine).
- The external SSD holds **backups only** — never live data. USB storage is
  where databases go to get corrupted.
- **Restore-test quarterly**: untar a backup into a scratch CouchDB container
  on the cold spare or old laptop, open Fauxton, see real documents. A backup
  that has never been restored is a hope, not a backup.

---

## 10. The upgrade loop (server N → server N+1)

Hardware ages out every ~6–8 years. Each replacement is this document again,
abbreviated:

1. Buy the equivalent box of that era (§1 checklist still applies).
2. §2 OS, §3 `git clone` + restore `.env` + `docker compose up`
   (images from the registry, or `docker load` from the archive).
3. §5 replicate from the live server (or restore the latest backup if it's
   an emergency replacement).
4. §4 hostname swap + re-shares. §6 verify.

Time it. If it takes more than an hour, whatever slowed you down is a gap in
this document — fix the document.

---

## 11. Migrating away from Tailscale (if it ever turns hostile)

Tailscale currently plays five roles: **network reachability** (NAT
traversal + relays), **TLS certs** (Let's Encrypt, bound to the ts.net
name), **DNS** (MagicDNS hostname), **access control** (the ACL), and
**identity** (users + machine shares). The exit must replace all five.
Don't do this preemptively — Tailscale's free tier (3 users / 100 devices,
sharees uncounted) fits this project comfortably. Triggers: free tier
shrinks below your needs, pricing turns predatory, or the company folds.

**Recommended path — Headscale** (self-hosted, open-source reimplementation
of the coordination server; the *clients* stay the same open-source
Tailscale apps):

1. **Buy a domain** (~₹700–1000/yr, the one new recurring cost). Needed
   because browsers require real HTTPS for the app's secure-context APIs
   (Web Crypto for offline login, service worker) — self-signed certs mean
   manually installing a CA on every friend's device. Not worth it.
2. **Run headscale** (Docker, can live on this same server) with its
   embedded DERP relay. It needs one publicly reachable port — router
   port-forward, or a ₹300/mo micro-VPS as the rendezvous if CGNAT blocks
   you.
3. **Re-point every device**: `tailscale up --login-server=https://hs.yourdomain`.
   Friends become headscale users (it has no cross-tailnet sharing — they
   join your network, restricted by ACL exactly like today).
4. **Certs move to Caddy**: it already fronts everything (§3); switch it
   from plain :8080 to terminating TLS itself with a Let's Encrypt cert via
   DNS-01 challenge (works without public HTTP exposure). tailscale serve's
   job disappears entirely.
5. **ACL**: headscale uses the same policy format — port the
   `shared → :443` rule as a user-based rule.
6. **Clients**: update `COGITATOR_UPLINK_HOST` on each device (boot screen
   field) and the default in BootScreen/MobileBootScreen/useFinanceData.
   ⚠ `couchAuth.js` guesses protocol by hostname — `ts.net` → https, anything
   else → http — so either enter the host **with an explicit `https://`
   prefix** or fix that heuristic at migration time.

**Fallback path — plain WireGuard + Caddy**: zero third-party software at
all, at the cost of hand-managing peer keys/configs per device and a static
hub (port-forward or VPS). Same Caddy/cert/host steps as above. Choose this
only if headscale itself is somehow off the table — the manual key ceremony
per friend is the price.

**What survives unchanged either way**: CouchDB, the data, the compose
stack, the app (host is already a configurable setting), the service worker
(its `/db` exclusion is path-based, not domain-based), and the backups.
The app was built same-origin behind one TLS endpoint — any stack that
reproduces "one hostname, one cert, `/` + `/db`" satisfies it.

## 12. Quarterly ritual (15 minutes)

- [ ] Kuma: all checks green, no flapping history
- [ ] Cockpit: SMART healthy, disk <70 % full, updates applied, uptime sane
- [ ] Restore-test one backup (rotate: local / offsite)
- [ ] `docker compose pull` security patches? (deliberate, after backups)
- [ ] Cold spare: power it on, let it update, power it off
- [ ] Glance at Tailscale admin: expected devices only, shares as expected
