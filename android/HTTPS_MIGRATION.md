# Moving CouchDB from HTTP-on-tailnet-IP → HTTPS via `tailscale serve`

Your current setup (`http://100.92.151.105:5984`) works on desktop
because nothing validates anything; it fails on phone because of the
combination of two things, neither of them obvious:

1. **You're using a raw tailnet IP.** Tailscale's ACME-issued certs
   are bound to the *MagicDNS hostname* — e.g.
   `taild8bd6e.ts.net` (or a per-machine `couch.taild8bd6e.ts.net`).
   A cert that says "I am `taild8bd6e.ts.net`" being presented for a
   connection to `100.92.151.105` fails SNI/hostname verification
   in every modern client, Android included. The error is silent in
   the WebView; it just looks like "https doesn't work on phone."
2. **CouchDB doesn't terminate TLS itself by default.** Even if you
   point an HTTPS client at port 5984, you get plain HTTP back and
   the handshake fails. TLS has to be done by `tailscale serve`
   (preferred) or a reverse proxy.

Fix is `tailscale serve` doing TLS termination on port 443, proxying
to CouchDB on `127.0.0.1:5984`. The phone talks to the hostname,
the cert matches, MagicDNS resolves it on the tailnet — done.

## 1. Lock CouchDB to localhost

On the CouchDB host, edit `/opt/couchdb/etc/local.ini` (path varies
by install — could be `/etc/couchdb/local.ini`):

```ini
[chttpd]
bind_address = 127.0.0.1
port = 5984
require_valid_user = true
```

Restart CouchDB. Verify only localhost can reach it:

```bash
curl http://127.0.0.1:5984/        # works
curl http://100.92.151.105:5984/   # connection refused / hang
```

If the second one still works, CouchDB is still listening on the
wrong interface — re-check `bind_address` in *all* ini files
(`default.ini` may override).

## 2. Tell Tailscale to serve HTTPS in front of it

On the same host (still as your user, no sudo needed for tailscale):

```bash
tailscale serve --bg --https=443 http://localhost:5984
```

That single line:
- Provisions a real TLS cert via Let's Encrypt (delivered through
  Tailscale's ACME bridge — no DNS-01 setup of your own).
- Listens on port 443 of the tailnet IP for HTTPS.
- Proxies decrypted traffic to `http://127.0.0.1:5984`.

Verify:

```bash
tailscale serve status
# Should show:
#   https://<hostname>.<tailnet>.ts.net (tailnet only)
#   |-- / proxy http://127.0.0.1:5984
```

Test from another tailnet device (laptop, phone in browser):

```
https://<hostname>.<tailnet>.ts.net/
# CouchDB welcome JSON, no cert warning
```

If you see a cert warning at this point on the *phone*, MagicDNS may
not be enabled on the device — open Tailscale app → Settings →
MagicDNS toggle.

## 3. Update the app

Change the default uplink host in [src/components/layout/BootScreen.jsx](../src/components/layout/BootScreen.jsx) and [src/components/mobile/MobileBootScreen.jsx](../src/components/mobile/MobileBootScreen.jsx):

```diff
- const [host, setHost] = useState(localStorage.getItem('COGITATOR_UPLINK_HOST') || '192.168.29.100:5984');
+ const [host, setHost] = useState(localStorage.getItem('COGITATOR_UPLINK_HOST') || 'couch.<your-tailnet>.ts.net');
```

And the protocol — currently hardcoded to `http://` in the auth
handler (`const protocol = 'http://';`):

```diff
- const protocol = 'http://';
+ const protocol = 'https://';
```

(Same change in MobileBootScreen.jsx.) Strip the `:5984` from the
host since you're now on the default HTTPS port (443).

## 4. Lock the Android network config back down

In [android/app/src/main/res/xml/network_security_config.xml](app/src/main/res/xml/network_security_config.xml),
**delete** the `<domain-config cleartextTrafficPermitted="true">`
block entirely. The `<base-config cleartextTrafficPermitted="false">`
will now enforce HTTPS-only for the whole app.

Also in [capacitor.config.json](../capacitor.config.json):

```diff
  "android": {
-   "allowMixedContent": true
+   "allowMixedContent": false
  }
```

Re-sync:

```bash
npm run build
npx cap sync android
```

## 5. Wipe and reinstall users on the phone

Existing users will have `COGITATOR_UPLINK_HOST` pointing at the old
IP in localStorage. Easiest: uninstall + reinstall the app once
post-migration. Alternative: open the boot screen, edit the host
field manually, restart.

## 6. Tighten Tailscale ACL (separate step but cheap)

In the Tailscale admin console, edit your ACL. Tag the CouchDB host
and your devices:

```json
{
  "tagOwners": {
    "tag:couch-server": ["autogroup:admin"],
    "tag:client":       ["autogroup:admin"]
  },
  "acls": [
    {
      "action": "accept",
      "src":    ["tag:client"],
      "dst":    ["tag:couch-server:443"]
    }
  ]
}
```

Apply tags to the host machine (Devices → ⋯ → Edit tags →
`tag:couch-server`) and to each device that should connect
(`tag:client`). New devices added to your tailnet for unrelated
reasons now cannot reach CouchDB by default.

## Troubleshooting cheatsheet

| Symptom on phone | Likely cause | Fix |
|---|---|---|
| `ERR_CERT_COMMON_NAME_INVALID` | Using IP instead of MagicDNS hostname | Switch host to `*.ts.net` name |
| `ERR_CONNECTION_REFUSED` | Tailscale off on phone, or ACL blocking | Open Tailscale app, check ACL |
| `ERR_CLEARTEXT_NOT_PERMITTED` | App tried HTTP but base-config now denies | Make sure protocol switched to `https://` |
| "Failed to fetch" silent | MagicDNS off | Tailscale app → Settings → MagicDNS |
| 401 from CouchDB | Cookie not surviving the proxy hop | Confirm `tailscale serve` is proxying request headers (it does by default; no fix usually needed) |
