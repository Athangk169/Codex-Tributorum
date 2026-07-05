# Operations Runbook

Day-to-day tasks for running the Codex Tributorum stack. Pragmatic, in roughly the
order you'll need them.

---

## 1. Daily startup checklist

Nothing to do — everything is set up as a background service. If you've just rebooted:

```powershell
tailscale status              # confirm tailnet up, devices present
tailscale serve status        # confirm /  → dist  and /db → couchdb still wired
```

The two `tailscale serve` rules persist across reboots (they're `--bg`). CouchDB on
Windows runs as a service (`Apache CouchDB`) and starts automatically.

If `tailscale serve status` is empty, see [§ Restoring tailscale serve config](#restoring-tailscale-serve-config).

## 2. Rebuild & redeploy after code changes

```powershell
# Desktop (tailnet-served dist/)
npm run build                 # tailscale serve hosts dist/ directly — no extra step

# Android
npm run build
npx cap sync android
# then in Android Studio: Build → Build APK(s) (or Build → Rebuild Project)
# install the new APK on the phone (uninstall the old one first if signing complains)
```

The `tailscale serve` setup reads files straight from `dist/` on disk, so a fresh
build is live the moment vite finishes — no service to restart. Hard-refresh
(`Ctrl+Shift+R`) in the browser to bust the service worker cache. The SW will see the
new index hash and prompt for an update via the `SwUpdateBanner` component.

## 3. Backups

### CouchDB data

Three databases hold everything: `finances`, `metadata_vault`, `investments_vault`.

**Quick dump (run from any tailnet client, replace `<u>:<p>`):**

```powershell
$ts = Get-Date -Format "yyyy-MM-dd"
$u = "admin"; $p = "<password>"; $h = "https://laptop-lg23d2mc.taild8bd6e.ts.net/db"

curl.exe -sk -u "${u}:${p}" "$h/finances/_all_docs?include_docs=true" `
  > "backups/finances-$ts.json"
curl.exe -sk -u "${u}:${p}" "$h/metadata_vault/_all_docs?include_docs=true" `
  > "backups/metadata_vault-$ts.json"
curl.exe -sk -u "${u}:${p}" "$h/investments_vault/_all_docs?include_docs=true" `
  > "backups/investments_vault-$ts.json"
```

Put the three JSON files somewhere safe (encrypted USB, password-manager secure
note, your normal backup target).

**Better — couchdb-dump (preserves attachments + design docs):**

```powershell
npm install -g couchdb-dump
couchdb-dump -H laptop-lg23d2mc.taild8bd6e.ts.net -P 443 -d finances `
  -u admin -p <password> --insecure --quiet > "backups/finances-$ts.couch"
```

**Easiest — in-app data-tithe (no credentials needed):**

Log in on desktop as Sanguinius and click `[ TITHE: EXTRACT ]` in the footer.
Downloads a `codex_tributorum_tithe_<date>.xlsx` with every document from all
three databases (one sheet per doc type, nested fields as JSON in their cells).
Works offline; readable in Excel; restorable via `scripts/restore.mjs` (see §4).
Does NOT include: CouchDB user accounts, `_security` objects, design docs, or
revision history — after a from-scratch restore, redo §5b for those.

**Recommended cadence**: weekly while in active use, monthly otherwise.
Schedule via Windows Task Scheduler if you want it automated.

### Release keystore

`android/app/codex-release.keystore` is the *most important* file in the project.
Lose it and you can never ship an upgrade to existing users without forcing a full
reinstall. See [android/RELEASE_SIGNING.md](android/RELEASE_SIGNING.md) for the
intended storage targets (encrypted USB + password-manager secure note +
off-machine encrypted).

## 4. Restore from backup

```powershell
$u = "admin"; $p = "<password>"; $h = "https://laptop-lg23d2mc.taild8bd6e.ts.net/db"

# 1. Recreate the database (will fail if it already exists — that's safe)
curl.exe -sk -u "${u}:${p}" -X PUT "$h/finances"

# 2. Bulk-insert from the dump
$docs = (Get-Content "backups/finances-2026-06-01.json" | ConvertFrom-Json).rows.doc
$body = @{ docs = $docs } | ConvertTo-Json -Depth 100 -Compress
$body | curl.exe -sk -u "${u}:${p}" -X POST "$h/finances/_bulk_docs" `
  -H "Content-Type: application/json" -d "@-"
```

Repeat for the other two databases. The `_rev` fields in the dump will be replayed,
so you get the exact same revision history (provided you're restoring into a clean DB).

**From a data-tithe workbook (`.xlsx`):**

```powershell
$env:COUCH_USER = "admin"; $env:COUCH_PASS = "<password>"
node scripts/restore.mjs backups/codex_tributorum_tithe_2026-07-05.xlsx `
  https://laptop-lg23d2mc.taild8bd6e.ts.net/db
```

Creates the three databases if missing and bulk-writes every document. Docs that
already exist are skipped and counted (safe to run against a half-populated DB);
add `--overwrite` to replace them instead. `--dry-run` parses the workbook and
reports what would be written without touching the network. Fresh revisions are
minted (the workbook's `_rev` column is informational only). User accounts and
`_security` are not in the workbook — redo §5b after a from-scratch restore.

## 5. Add a new user (friend)

Quick version — assumes you've already shared your laptop into their tailnet account.

### 5a. Tailscale side

In the Tailscale admin console:

1. Devices → `laptop-lg23d2mc` → triple-dot menu → **Share…**
2. Generate a share link, send to the friend.
3. They accept on their phone or laptop. Their device shows up in your tailnet
   as `autogroup:shared` — they can only reach `tag:couch-server:443` per your ACL.

### 5b. CouchDB side

```powershell
$u = "admin"; $p = "<password>"; $b = "https://localhost:6984"
$friend = "alice"
$friendPass = "<a strong passphrase you give them>"

# Create the user
$userDoc = @{
  _id = "org.couchdb.user:$friend"
  name = $friend
  type = "user"
  roles = @()
  password = $friendPass
} | ConvertTo-Json
$userDoc | curl.exe -sk -u "${u}:${p}" -X PUT "$b/_users/org.couchdb.user:$friend" `
  -H "Content-Type: application/json" -d "@-"

# Add them to members.names on all three DBs.
# NOTE: PUT /_security REPLACES the whole document — fetch the current
# member list and append, or adding friend #2 silently removes friend #1.
foreach ($db in @("finances", "metadata_vault", "investments_vault")) {
  $sec = curl.exe -sk -u "${u}:${p}" "$b/$db/_security" | ConvertFrom-Json
  $names = @($sec.members.names) + $friend | Select-Object -Unique
  $body = @{
    admins  = @{ roles = @("_admin"); names = @() }
    members = @{ roles = @("_admin"); names = $names }
  } | ConvertTo-Json -Depth 4
  $body | curl.exe -sk -u "${u}:${p}" -X PUT "$b/$db/_security" `
    -H "Content-Type: application/json" -d "@-"
}
```

Give them the username, password, and the APK. On first login the app seeds their
category rules from the `Sanguinius` admin entry (see
[useFinanceData.js:136](src/hooks/useFinanceData.js#L136)) and they start with a fresh
ledger. Engine queries are scoped by `${userId}` key prefixes so they only see their
own data in the UI.

## 6. Remove a user (friend)

If you stop trusting someone, two layers of revoke:

```powershell
# 1. Tailscale: Devices → their device → Remove. They lose network path
#    immediately. This alone is sufficient.

# 2. (Optional) Disable their CouchDB user — belt and suspenders
$u = "admin"; $p = "<password>"; $b = "https://localhost:6984"
$friend = "alice"

$user = curl.exe -sk -u "${u}:${p}" "$b/_users/org.couchdb.user:$friend" | ConvertFrom-Json
$user | Add-Member -NotePropertyName _deleted -NotePropertyValue $true -Force
$user | ConvertTo-Json | curl.exe -sk -u "${u}:${p}" -X PUT "$b/_users/org.couchdb.user:$friend" `
  -H "Content-Type: application/json" -d "@-"

# 3. Remove them from members.names on the three DBs — same loop as 5b, but
#    filter instead of append:
#    $names = @($sec.members.names) | Where-Object { $_ -ne $friend }
```

Their device still holds a local PouchDB replica with whatever they synced before
removal — there is no way to recall that. But no new data flows in or out.

## 7. Troubleshooting

### "Site can't be reached" / browser error on the tailnet URL

Run on the laptop:

```powershell
tailscale status                # tailnet up?
tailscale serve status          # rules present?
curl -sk https://laptop-lg23d2mc.taild8bd6e.ts.net/    # 200 expected
curl -sk https://laptop-lg23d2mc.taild8bd6e.ts.net/db/ # 401 expected (auth required)
```

If `tailscale serve status` is empty, restore the config (next section).

If `/db/` returns connect-refused, CouchDB is down. Restart via Services.msc →
`Apache CouchDB` → Start.

### Restoring tailscale serve config

The two rules need to be re-added from an elevated PowerShell:

```powershell
tailscale serve --bg --set-path=/ "C:\Users\athan\Downloads\finance-dashboard\dist"
tailscale serve --bg --set-path=/db https+insecure://localhost:6984
tailscale serve status         # verify both shown
```

### Service worker stuck serving an old build

Open DevTools → Application → Service Workers → Unregister, then `Ctrl+Shift+R`.
Or in DevTools console:

```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))
  .then(() => caches.keys())
  .then(ks => Promise.all(ks.map(k => caches.delete(k))))
  .then(() => location.reload());
```

### Android APK won't install — signing mismatch

You changed the signing key (debug ↔ release) without uninstalling. Uninstall the
old app first, then install the new APK. App data is wiped because the OS treats it
as a different app at that point — log in again, the PouchDB sync pulls everything
back from CouchDB.

### Litany overlay doesn't appear

It fires after 1 minute of *no interaction*. Stop touching the screen. Doesn't show in
maximised Holo mode (that slide goes z-index 9999 to match).

### Sync stuck on "AWAITING" forever

The probe in [useFinanceData.js](src/hooks/useFinanceData.js) hits
`https://laptop-lg23d2mc.taild8bd6e.ts.net/db/` with a 4s timeout. If the laptop is
unreachable, you'll see `NO SIGNAL` within 4s. If you're stuck on `AWAITING`, the
probe is hitting *something* but PouchDB sync isn't promoting to `ok` — usually
means CouchDB returned an auth error. Check the browser console for
`UPLINK FAILURE:` log lines.

## 8. The "I broke everything" panic checklist

In order of likelihood:

1. **Tailscale not running** → start the Tailscale tray app on the laptop, then
   `tailscale up` if it didn't auto-start.
2. **CouchDB service stopped** → Services.msc → `Apache CouchDB` → Start.
3. **tailscale serve config lost** → re-run the two `tailscale serve` commands
   from an elevated PowerShell.
4. **Wrong network on the phone** → make sure Tailscale is enabled on the phone
   too, and MagicDNS is on (Tailscale app → Settings → MagicDNS).
5. **dist/ deleted** → `npm run build` to regenerate.
6. **Browser cached a dead version** → hard refresh, or the SW console one-liner
   above.
