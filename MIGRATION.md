# CouchDB Migration Plan

Two-phase plan for moving the CouchDB data and (eventually) the host machine.

- **Phase 1** — move CouchDB's data directory to an **external SSD on the same
  laptop**. Smaller change; keeps the laptop as the host. Free up internal disk,
  better I/O if the SSD is fast, and the data is now portable.
- **Phase 2** — move the CouchDB host to a **Raspberry Pi**. The laptop becomes
  just another client; the Pi runs 24/7. Bigger change; touches Tailscale, the
  app's host config, and the SSD potentially gets carried over to the Pi.

You can do Phase 1 immediately, sit on it for months, then do Phase 2 when you're
ready. They're independent.

---

## Phase 1: CouchDB data → external SSD (same laptop)

### Why

- Internal laptop disk freed up. CouchDB data grows over time.
- SSD can be carried to the Pi later (Phase 2).
- A NAS or hardware-encrypted SSD also gives a degree of physical separation
  from the laptop.

### Prerequisites

- External SSD, formatted **NTFS** (not exFAT — CouchDB needs proper file locks),
  reliably mounted on boot.
- **Stable drive letter** — Windows assigns drive letters in connection order by
  default; force a specific one in Disk Management. The CouchDB config will
  reference it by path, so it must not change.
- Comfortable working in `C:\Program Files\Apache CouchDB\etc\local.ini`.

### Steps

#### 1. Back up first

Per [OPERATIONS.md § Backups](OPERATIONS.md#3-backups). Don't skip.

#### 2. Identify the current data directory

Open `C:\Program Files\Apache CouchDB\etc\default.ini` (or `local.ini` if it
overrides). Look for:

```ini
[couchdb]
database_dir = ./data
view_index_dir = ./data
```

The actual on-disk path is usually:

```
C:\Program Files\Apache CouchDB\data\
```

with `.couch` files for each database and a `.shards/` folder. Confirm by
listing the directory.

#### 3. Pick a stable mount point on the SSD

Assume the SSD ends up as `E:`. Create:

```
E:\couchdb\data\
```

Test that `E:` survives a reboot. If Windows ever decides to swap it to `F:` your
CouchDB will fail to start.

> **Tip**: in Disk Management → right-click partition → "Change Drive Letter
> and Paths…" → assign `E:` and leave it. Or mount the SSD into a folder like
> `C:\mnt\couch-ssd` for absolute path stability.

#### 4. Stop the CouchDB service

```powershell
Stop-Service "Apache CouchDB"
```

Wait for it to fully stop. Verify with:

```powershell
Get-Service "Apache CouchDB"
```

Status should be `Stopped`.

#### 5. Move the data

```powershell
Move-Item "C:\Program Files\Apache CouchDB\data\*" "E:\couchdb\data\" -Force
```

If the source had `.shards/` and `.couch` files, they're all in the target now.
The original `data\` directory should be empty (delete it later for cleanliness,
or keep as a safety net).

#### 6. Update CouchDB config

Edit `C:\Program Files\Apache CouchDB\etc\local.ini`. Under `[couchdb]`, set
absolute paths:

```ini
[couchdb]
database_dir = E:/couchdb/data
view_index_dir = E:/couchdb/data
```

**Use forward slashes** — CouchDB on Windows accepts forward slashes everywhere
and they avoid the escape-character traps with backslashes in INI files.

#### 7. Start CouchDB

```powershell
Start-Service "Apache CouchDB"
```

Watch the logs while it comes up:

```powershell
Get-Content "C:\Program Files\Apache CouchDB\var\log\couchdb.log" -Tail 50 -Wait
```

Expected: `Apache CouchDB has started. Time to relax.`

#### 8. Verify

```powershell
curl.exe -sk -u admin:<password> https://localhost:6984/_all_dbs
# Should list: _replicator, _users, finances, metadata_vault, investments_vault
curl.exe -sk -u admin:<password> https://localhost:6984/finances | findstr doc_count
# Document count should match what you had before
```

Open the app from the phone — sync should be instant (no data delta, same DB
contents at the same path).

#### 9. If something goes wrong

The original `C:\Program Files\Apache CouchDB\data\` is empty but not gone. To
revert:

1. `Stop-Service "Apache CouchDB"`
2. Move files back: `Move-Item "E:\couchdb\data\*" "C:\Program Files\Apache CouchDB\data\"`
3. Revert `local.ini` to `./data`
4. `Start-Service "Apache CouchDB"`

You always have the JSON dumps from step 1 as the ultimate fallback.

### What this doesn't change

- The CouchDB endpoint is still `localhost:6984` from the laptop's perspective.
- `tailscale serve --set-path=/db https+insecure://localhost:6984` keeps working
  unchanged.
- The app's `COGITATOR_UPLINK_HOST` is the same MagicDNS hostname.
- Tailscale ACLs unchanged.

Phase 1 is a **transparent** change. Clients don't know anything happened.

---

## Phase 2: CouchDB host → Raspberry Pi

### Why

- The laptop is no longer always-on. Friends can use the dashboard whenever the
  Pi is on (which is 24/7, cost ~3W).
- The laptop is freed up to be just another client.
- Pi + SSD is more representative of a "real" home-server setup.

### Prerequisites

- Raspberry Pi 4 (or 5) with at least 4 GB RAM. The Pi 4 with 2 GB will work
  but CouchDB is happier with 4+.
- Raspberry Pi OS 64-bit (Bookworm). 32-bit will not run modern CouchDB.
- Ethernet preferred for stable always-on connectivity.
- Either the SSD from Phase 1 (carry it over via USB3 enclosure) or a dedicated
  USB SSD for the Pi.
- A Tailscale account login on the Pi (the same one that owns your tailnet).

### Plan overview

```
Before                                After
──────                                ─────
Laptop ──┐                            Laptop ──┐
         │                                     │
        Pi ──── tailnet                       Pi ─── tailnet
         │                              [tag:couch-server now lives here]
         X (no role)                            │
                                           CouchDB on Pi
Phone ──┘ ◄── reaches laptop          Phone ──┘ ◄── reaches Pi
```

### Steps

#### 1. Provision the Pi

```bash
# On the Pi, after first boot of Raspberry Pi OS 64-bit:
sudo apt update
sudo apt full-upgrade -y
sudo hostnamectl set-hostname codex-pi
```

Reboot. SSH in over the local network for the rest.

#### 2. Install CouchDB on the Pi

CouchDB ships official Debian packages with arm64 support.

```bash
curl https://couchdb.apache.org/repo/keys.asc | gpg --dearmor | sudo tee /usr/share/keyrings/couchdb-archive-keyring.gpg >/dev/null 2>&1
echo "deb [signed-by=/usr/share/keyrings/couchdb-archive-keyring.gpg] https://apache.jfrog.io/artifactory/couchdb-deb/ bookworm main" | sudo tee /etc/apt/sources.list.d/couchdb.list >/dev/null
sudo apt update
sudo apt install -y couchdb
# Installer asks:
#   - standalone or clustered → standalone
#   - bind address            → 127.0.0.1
#   - admin password          → pick a strong one. SAVE IT.
```

#### 3. Lock CouchDB to localhost + require auth

Edit `/opt/couchdb/etc/local.ini`:

```ini
[chttpd]
bind_address = 127.0.0.1
port = 5984
require_valid_user = true
```

Restart:

```bash
sudo systemctl restart couchdb
curl -s http://127.0.0.1:5984/   # 401 expected (auth required)
```

#### 4. (Optional) Move data dir to the SSD on the Pi

If you carried the Phase 1 SSD over:

```bash
sudo systemctl stop couchdb
# Mount the SSD persistently — /etc/fstab entry to your taste
sudo mkdir -p /mnt/couch-ssd
# After mounting:
sudo cp -a /opt/couchdb/data/* /mnt/couch-ssd/   # or move
sudo chown -R couchdb:couchdb /mnt/couch-ssd
# Edit /opt/couchdb/etc/local.ini:
#   [couchdb]
#   database_dir = /mnt/couch-ssd
#   view_index_dir = /mnt/couch-ssd
sudo systemctl start couchdb
```

If you're starting fresh on Pi storage, skip — defaults are fine.

#### 5. Install Tailscale on the Pi + join the tailnet

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# Open the URL it prints, authenticate as the SAME tailnet owner.
```

Verify from any device:

```
tailscale status      # codex-pi should appear
```

#### 6. Set up tailscale serve on the Pi

The Pi needs to serve the same two routes the laptop did:
- `/` → static dist files
- `/db` → local CouchDB

The dist files can either be served from the Pi (copy them over) or kept on the
laptop (with the Pi only handling `/db`). Cleanest: Pi serves both. The Pi
becomes the new "host".

```bash
# Copy dist/ from the laptop to the Pi (run on the laptop):
scp -r C:\Users\athan\Downloads\finance-dashboard\dist pi@codex-pi:/home/pi/codex-dist

# On the Pi:
sudo tailscale serve --bg --set-path=/   /home/pi/codex-dist
sudo tailscale serve --bg --set-path=/db http://localhost:5984
sudo tailscale serve status
```

> **Note**: on Linux, `tailscale serve` for filesystem paths needs `sudo` or
> CAP_NET_BIND_SERVICE; on Windows it required local admin (same idea).
> Also — on Linux, talking to local CouchDB over plain HTTP is fine because
> nothing else can hit localhost. No need for the `https+insecure://` workaround.

#### 7. Replicate data laptop → Pi

This is the actual data move. PouchDB / CouchDB replication is bidirectional and
incremental — perfect for this.

From the laptop, trigger a one-shot replication to the Pi for each DB:

```powershell
$u = "admin"; $p_src = "<laptop couch admin password>"
$p_dst = "<pi couch admin password>"   # the one you set in step 2

$src = "https://$($u):$($p_src)@localhost:6984"
$dst = "https://$($u):$($p_dst)@codex-pi.taild8bd6e.ts.net/db"

# (Adjust the destination URL if you used a different MagicDNS name for the Pi.)

foreach ($db in "finances","metadata_vault","investments_vault","_users") {
  $body = @{ source = "$src/$db"; target = "$dst/$db"; create_target = $true } | ConvertTo-Json
  $body | curl.exe -sk -u "${u}:${p_src}" -X POST `
    "https://localhost:6984/_replicate" `
    -H "Content-Type: application/json" -d "@-"
}
```

This pushes everything (transactions + metadata + users) to the Pi. Including
`_users` is what makes existing users be able to log in to the Pi — same names,
same passwords.

Verify on the Pi:

```bash
curl -sku admin:<pw> https://codex-pi.taild8bd6e.ts.net/db/finances | jq .doc_count
# Should match the laptop's doc count.
```

#### 8. Switch the ACL tag

In the Tailscale admin console:

1. Machines → `laptop-lg23d2mc` → ⋯ → Edit ACL tags → **untick** `tag:couch-server`.
2. Machines → `codex-pi` → ⋯ → Edit ACL tags → **tick** `tag:couch-server`.

Now `autogroup:shared` only reaches port 443 of the **Pi**, not the laptop.

#### 9. Point the app at the Pi

Two paths:

**Option A — update the app default**. Edit:
- [src/components/layout/BootScreen.jsx](src/components/layout/BootScreen.jsx) — `COGITATOR_UPLINK_HOST` default
- [src/components/mobile/MobileBootScreen.jsx](src/components/mobile/MobileBootScreen.jsx) — same default
- [src/hooks/useFinanceData.js](src/hooks/useFinanceData.js) — `savedHost` default in two places

Replace `laptop-lg23d2mc.taild8bd6e.ts.net/db` with `codex-pi.taild8bd6e.ts.net/db`.

Rebuild, redeploy. Existing users with a stale `COGITATOR_UPLINK_HOST` in
`localStorage` need to either:
- Open the boot screen → MODIFY → update the host manually, or
- Uninstall + reinstall the app (wipes localStorage; falls back to the new
  default).

**Option B — leave the app pointed at the laptop, have the laptop proxy `/db`
to the Pi.** Simpler for existing users, more moving parts. On the laptop:

```powershell
tailscale serve --bg --set-path=/db https+insecure://codex-pi.taild8bd6e.ts.net:443/db
```

I'd recommend Option A — it's cleaner, fewer hops, and lower latency.

#### 10. Decommission CouchDB on the laptop

After everyone has migrated:

```powershell
Stop-Service "Apache CouchDB"
Set-Service "Apache CouchDB" -StartupType Disabled
# Keep the data files around for a month as a safety net. Then delete.
```

Remove the laptop's `tailscale serve` rules (or leave them harmless):

```powershell
tailscale serve reset
```

(Or selectively unset the `/db` route — `reset` clears the whole serve config so
back it up first.)

### Verification checklist after Phase 2

- [ ] `tailscale ping codex-pi` from any device — replies.
- [ ] `https://codex-pi.taild8bd6e.ts.net/` in browser — dashboard loads.
- [ ] `https://codex-pi.taild8bd6e.ts.net/db/` — 401 (CouchDB welcome path,
      auth required).
- [ ] Open app from phone — sync LED goes from `AWAITING` → `ESTABLISHED`
      within a few seconds.
- [ ] Add a test transaction on phone — appears on desktop browser.
- [ ] Tailscale ACL preview (admin console) — `autogroup:shared` resolves to
      `codex-pi:443` only.
- [ ] Laptop's CouchDB service disabled, no `tailscale serve` rules pointing
      at it.

### Rollback plan

If something is fundamentally broken on the Pi, switching back is fast because
the laptop's data is *still there* (you didn't delete it, just stopped
replication):

1. Re-enable CouchDB on the laptop: `Set-Service "Apache CouchDB" -StartupType Auto; Start-Service "Apache CouchDB"`.
2. Re-add the laptop's `tailscale serve` rules (see
   [OPERATIONS.md § Restoring tailscale serve config](OPERATIONS.md#restoring-tailscale-serve-config)).
3. Swap the `tag:couch-server` tag back to the laptop in the admin console.
4. Revert the app's host default and rebuild (or just have users edit the host
   field in the boot screen).

Any data added *while the Pi was the source of truth* would need a one-shot
replication back from Pi → laptop. Same procedure as step 7, source and target
swapped.

---

## Appendix: bidirectional sync during transition

For zero-downtime cutover, you can run continuous replication in both directions
for the duration of the migration window:

```powershell
# On laptop — continuous push to Pi
$body = @{ source = "finances"; target = "$dst/finances"; continuous = $true } | ConvertTo-Json
$body | curl.exe -sk -u "${u}:${p_src}" -X POST `
  "https://localhost:6984/_replicator" `
  -H "Content-Type: application/json" -d "@-"
```

Now any write to either side propagates to the other. Cut over when you're ready
(swap the tag, repoint the app), then delete the replicator doc when done.
