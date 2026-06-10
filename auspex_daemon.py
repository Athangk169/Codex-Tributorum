"""
◈ AUSPEX DAEMON — CODEX TRIBUTORUM
====================================
Dual-source market data sync:
  - Indian Mutual Funds via AMFI NAVAll.txt
  - NSE Equities via Yahoo Finance

Runs every 15 minutes. On each run:
  1. Discovers every user with an investment manifest in the shared vault
     (users added later are picked up automatically — no config change)
  2. Archives last month's snapshot per user if missing
  3. Fetches current prices ONCE for the union of all users' holdings
     (AMFI once; each unique NSE equity once)
  4. Applies the shared price map to each user and writes back only the
     manifests whose prices actually changed

Set COUCH_APP_USER to restrict the sweep to a single user (e.g. for
debugging); leave it unset to sweep all users.

CREDENTIALS:
  Set environment variables before running:
    COUCH_HOST  — e.g. http://localhost:5984 or http://100.92.151.105:5984
    COUCH_USER  — your CouchDB username
    COUCH_PASS  — your CouchDB password

  Or create a .env file in the same directory:
    COUCH_HOST=http://localhost:5984
    COUCH_USER=Sanguinius
    COUCH_PASS=yourpassword

USAGE:
  python auspex_daemon.py

SYSTEMD SERVICE (for Raspberry Pi):
  Copy to /etc/systemd/system/auspex.service:

  [Unit]
  Description=Auspex Market Data Daemon
  After=network.target

  [Service]
  ExecStart=/usr/bin/python3 /home/pi/auspex_daemon.py
  Restart=always
  RestartSec=30
  Environment=COUCH_HOST=http://localhost:5984
  Environment=COUCH_USER=Sanguinius
  Environment=COUCH_PASS=yourpassword

  [Install]
  WantedBy=multi-user.target
"""

import os
import sys
import json
import requests
import time
from datetime import datetime, timedelta

try:
    import yfinance as yf
except ImportError:
    print("◈ ERROR: yfinance not installed. Run: pip install yfinance")
    sys.exit(1)

# ── Try loading .env file if present ──
def load_dotenv():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if not os.path.exists(env_path):
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                os.environ.setdefault(key.strip(), val.strip())

load_dotenv()

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ── Config from environment ──
COUCH_HOST = os.environ.get('COUCH_HOST', 'http://localhost:5984')
COUCH_USER = os.environ.get('COUCH_USER', '')
COUCH_PASS = os.environ.get('COUCH_PASS', '')
# Optional single-user override. Empty (the default) means sweep EVERY
# user that has an investment manifest in the shared vault.
SINGLE_USER = os.environ.get('COUCH_APP_USER', '').strip()
DB_NAME    = 'investments_vault'

# Every per-user current manifest shares this id prefix — used to
# enumerate all users in one query.
MANIFEST_PREFIX = 'finance:investments:current:'

if not COUCH_USER or not COUCH_PASS:
    print("◈ ERROR: COUCH_USER and COUCH_PASS must be set.")
    print("  Set environment variables or create a .env file.")
    sys.exit(1)


def manifest_id_for(user_id):
    return f"{MANIFEST_PREFIX}{user_id}"


def user_id_of(manifest):
    """User id from the manifest doc, falling back to its _id suffix."""
    return manifest.get('user_id') or manifest.get('_id', '').replace(MANIFEST_PREFIX, '', 1)

# ── AMFI alias matrix ──
# Maps UI ticker names to their AMFI scheme codes
# Format: "UI_TICKER": "AMFI:SCHEME_CODE"
ALIAS_MATRIX = {
    "MUTF_IN:NIPP_INDI_SMAL_1AOBL3E": "AMFI:118778",
}

# ── HTTP Session ──
session = requests.Session()
session.auth = (COUCH_USER, COUCH_PASS)
session.headers.update({'Content-Type': 'application/json'})


def couch_get(doc_id):
    """Fetch a document from investments_vault."""
    url = f"{COUCH_HOST}/{DB_NAME}/{doc_id}"
    resp = session.get(url, timeout=15)
    if resp.status_code == 200:
        return resp.json()
    return None


def couch_put(doc):
    """Write a document to investments_vault."""
    doc_id = doc['_id']
    url    = f"{COUCH_HOST}/{DB_NAME}/{doc_id}"
    resp   = session.put(url, json=doc, timeout=15)
    return resp.status_code in (200, 201, 202)


def discover_manifests():
    """Return every per-user current investment manifest in the vault.

    Honours COUCH_APP_USER as a single-user override; otherwise scans the
    whole `finance:investments:current:` id range in one `_all_docs` call,
    so users added later are picked up automatically on the next run.
    """
    if SINGLE_USER:
        manifest = couch_get(manifest_id_for(SINGLE_USER))
        return [manifest] if manifest else []

    url    = f"{COUCH_HOST}/{DB_NAME}/_all_docs"
    params = {
        'include_docs': 'true',
        'startkey': json.dumps(MANIFEST_PREFIX),
        'endkey':   json.dumps(MANIFEST_PREFIX + '￿'),
    }
    try:
        resp = session.get(url, params=params, timeout=30)
        if resp.status_code != 200:
            print(f"◈ ERROR: manifest discovery failed (HTTP {resp.status_code})")
            return []
        manifests = []
        for row in resp.json().get('rows', []):
            doc = row.get('doc')
            if doc and isinstance(doc.get('assets'), list):
                manifests.append(doc)
        return manifests
    except Exception as e:
        print(f"◈ ERROR: manifest discovery failed: {e}")
        return []


# ─────────────────────────────────────────────────────────────
# AMFI NAV FETCH
# ─────────────────────────────────────────────────────────────

def fetch_amfi_navs():
    """Fetches official daily NAV for all Indian Mutual Funds from AMFI."""
    print("  └─ Fetching AMFI Mutual Fund database...")
    navs = {}
    try:
        resp = requests.get("https://www.amfiindia.com/spages/NAVAll.txt", timeout=15)
        for line in resp.text.split("\n"):
            parts = line.split(";")
            if len(parts) >= 5 and parts[0].isdigit():
                scheme_code = parts[0].strip()
                nav_str     = parts[4].strip()
                try:
                    navs[scheme_code] = float(nav_str)
                except ValueError:
                    pass
        print(f"  └─ AMFI: {len(navs)} schemes loaded")
        return navs
    except Exception as e:
        print(f"  └─ [AMFI ERROR] {e}")
        return None


# ─────────────────────────────────────────────────────────────
# MONTHLY SNAPSHOT ARCHIVAL
# ─────────────────────────────────────────────────────────────

def ensure_monthly_snapshot(manifest):
    """
    On the first run of each month, archives last month's portfolio
    state as a finance:investments:snapshot:{userId}:{YYYY-MM} document
    for the given user's manifest.
    Safe to call on every run — exits immediately if snapshot exists.
    """
    user_id    = user_id_of(manifest)
    today      = datetime.now()
    last_month = (today.replace(day=1) - timedelta(days=1)).strftime('%Y-%m')
    snap_id    = f"finance:investments:snapshot:{user_id}:{last_month}"

    # Check if snapshot already exists
    existing = couch_get(snap_id)
    if existing:
        return  # Already archived

    print(f"  └─ [{user_id}] No snapshot for {last_month} — archiving now...")

    assets = manifest.get('assets', [])

    # Calculate totals
    total_invested = sum(
        round(a.get('avg_price', 0) * a.get('shares', 0), 2)
        for a in assets
    )
    total_current = sum(
        round(a.get('current_price', 0) * a.get('shares', 0), 2)
        for a in assets
    )

    # Build per-asset snapshot
    asset_snapshots = []
    for a in assets:
        invested = round(a.get('avg_price', 0) * a.get('shares', 0), 2)
        current  = round(a.get('current_price', 0) * a.get('shares', 0), 2)
        asset_snapshots.append({
            'ticker':             a.get('ticker'),
            'name':               a.get('name', ''),
            'avg_price':          a.get('avg_price', 0),
            'shares':             a.get('shares', 0),
            'price_at_snapshot':  a.get('current_price', 0),
            'invested':           invested,
            'current':            current,
        })

    snapshot = {
        '_id':            snap_id,
        'type':           'finance:investments:snapshot',
        'user_id':        user_id,
        'month':          last_month,
        'total_invested': total_invested,
        'total_current':  total_current,
        'assets':         asset_snapshots,
        'created':        datetime.now().isoformat() + 'Z',
    }

    if couch_put(snapshot):
        print(f"  └─ ◈ Archived snapshot for {last_month} "
              f"(invested: ₹{total_invested:,.2f}, current: ₹{total_current:,.2f})")
    else:
        print(f"  └─ [ARCHIVE FAILED] Could not write snapshot for {last_month}")


# ─────────────────────────────────────────────────────────────
# PRICE SYNC
# ─────────────────────────────────────────────────────────────

def _yahoo_ticker(target):
    return f"{target}.NS" if '.' not in str(target) else str(target)


def collect_targets(manifests):
    """Union of price targets across every user's holdings.

    Returns (equity_tickers, needs_amfi) so each external source is hit
    once per run regardless of how many users hold the same asset.
    """
    equity_tickers = set()
    needs_amfi     = False
    for manifest in manifests:
        for asset in manifest.get('assets', []):
            ui_ticker = asset.get('ticker')
            if not ui_ticker:
                continue
            target = ALIAS_MATRIX.get(ui_ticker, ui_ticker)
            if str(target).startswith('AMFI:'):
                needs_amfi = True
            else:
                equity_tickers.add(_yahoo_ticker(target))
    return equity_tickers, needs_amfi


def fetch_equity_prices(yf_tickers):
    """Fetch each unique NSE equity once via Yahoo → {yf_ticker: price}."""
    prices = {}
    for yf_ticker in sorted(yf_tickers):
        try:
            stock       = yf.Ticker(yf_ticker)
            todays_data = stock.history(period="1d")
            if not todays_data.empty:
                prices[yf_ticker] = float(todays_data['Close'].iloc[-1])
            else:
                last = stock.fast_info.get('last_price')
                if last is not None:
                    prices[yf_ticker] = float(last)
        except Exception as e:
            print(f"  └─ [EQUITY ERROR] {yf_ticker}: {e}")
    return prices


def resolve_price(ui_ticker, amfi_navs, equity_prices):
    """Price for one UI ticker from the already-fetched source maps."""
    target = ALIAS_MATRIX.get(ui_ticker, ui_ticker)
    if str(target).startswith('AMFI:'):
        if not amfi_navs:
            return None
        return amfi_navs.get(target.split(':')[1])
    return equity_prices.get(_yahoo_ticker(target))


def apply_prices(manifest, amfi_navs, equity_prices):
    """Update a manifest's assets in place. Returns True if anything moved."""
    user_id = user_id_of(manifest)
    updated = False
    for asset in manifest.get('assets', []):
        ui_ticker = asset.get('ticker')
        if not ui_ticker:
            continue
        price = resolve_price(ui_ticker, amfi_navs, equity_prices)
        if price is None:
            continue
        rounded = round(float(price), 2)
        if asset.get('current_price') != rounded:
            print(f"  └─ [{user_id}] {ui_ticker}: ₹{asset.get('current_price', '?')} → ₹{rounded}")
            asset['current_price'] = rounded
            updated = True
    return updated


def sync_market_data():
    print(f"\n[ {datetime.now().strftime('%H:%M:%S')} ] ◈ INITIATING DUAL-SOURCE UPLINK...")

    # Step 1: Discover every user with an investment manifest.
    manifests = discover_manifests()
    if not manifests:
        print("◈ ERROR: No investment manifests found.")
        print("  └─ Run the import script first, or check COUCH_APP_USER.")
        return
    print(f"  └─ Sweeping {len(manifests)} user(s): "
          f"{', '.join(user_id_of(m) for m in manifests)}")

    # Step 2: Archive last month per user if needed.
    for manifest in manifests:
        try:
            ensure_monthly_snapshot(manifest)
        except Exception as e:
            print(f"  └─ [ARCHIVE ERROR] [{user_id_of(manifest)}] {e}")

    # Step 3: Fetch each external source ONCE for the union of holdings.
    equity_tickers, needs_amfi = collect_targets(manifests)
    amfi_navs     = fetch_amfi_navs() if needs_amfi else None
    equity_prices = fetch_equity_prices(equity_tickers) if equity_tickers else {}

    # Step 4: Apply the shared price map to each user; write only changes.
    synced, unchanged, failed = 0, 0, 0
    for manifest in manifests:
        user_id = user_id_of(manifest)
        try:
            if apply_prices(manifest, amfi_navs, equity_prices):
                manifest['last_updated'] = datetime.now().isoformat() + 'Z'
                if couch_put(manifest):
                    synced += 1
                else:
                    failed += 1
                    print(f"◈ UPLINK FAILED: could not write manifest for {user_id}.")
            else:
                unchanged += 1
        except Exception as e:
            failed += 1
            print(f"  └─ [SYNC ERROR] [{user_id}] {e}")

    print(f"◈ UPLINK COMPLETE: {synced} updated, {unchanged} unchanged, {failed} failed.")


# ─────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("==================================================")
    print("◈ AUSPEX DAEMON ONLINE (DUAL-SOURCE ACTIVE)")
    print(f"  Host:  {COUCH_HOST}")
    print(f"  Scope: {SINGLE_USER if SINGLE_USER else 'ALL USERS'}")
    print("==================================================")

    while True:
        try:
            sync_market_data()
        except Exception as e:
            print(f"◈ CRITICAL UPLINK FAILURE: {e}")
        time.sleep(900)  # 15 minutes