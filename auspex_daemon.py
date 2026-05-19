"""
◈ AUSPEX DAEMON — CODEX TRIBUTORUM
====================================
Dual-source market data sync:
  - Indian Mutual Funds via AMFI NAVAll.txt
  - NSE Equities via Yahoo Finance

Runs every 15 minutes. On each run:
  1. Checks if last month needs archiving — creates monthly snapshot if missing
  2. Fetches current prices for all assets
  3. Updates finance:investments:current:{USER_ID} if prices changed

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
USER_ID    = os.environ.get('COUCH_APP_USER', 'Sanguinius')
DB_NAME    = 'investments_vault'

if not COUCH_USER or not COUCH_PASS:
    print("◈ ERROR: COUCH_USER and COUCH_PASS must be set.")
    print("  Set environment variables or create a .env file.")
    sys.exit(1)

# ── Document IDs (new namespaced model) ──
MANIFEST_ID = f"finance:investments:current:{USER_ID}"

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

def ensure_monthly_snapshot():
    """
    On the first run of each month, archives last month's portfolio
    state as a finance:investments:snapshot:{userId}:{YYYY-MM} document.
    Safe to call on every run — exits immediately if snapshot exists.
    """
    today      = datetime.now()
    last_month = (today.replace(day=1) - timedelta(days=1)).strftime('%Y-%m')
    snap_id    = f"finance:investments:snapshot:{USER_ID}:{last_month}"

    # Check if snapshot already exists
    existing = couch_get(snap_id)
    if existing:
        return  # Already archived

    print(f"  └─ No snapshot for {last_month} — archiving now...")

    # Get current manifest to snapshot
    manifest = couch_get(MANIFEST_ID)
    if not manifest:
        print(f"  └─ [ARCHIVE SKIP] Manifest not found")
        return

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
        'user_id':        USER_ID,
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

def sync_market_data():
    print(f"\n[ {datetime.now().strftime('%H:%M:%S')} ] ◈ INITIATING DUAL-SOURCE UPLINK...")

    # Step 1: Archive last month if needed
    try:
        ensure_monthly_snapshot()
    except Exception as e:
        print(f"  └─ [ARCHIVE ERROR] {e}")

    # Step 2: Load manifest
    manifest = couch_get(MANIFEST_ID)
    if not manifest:
        print(f"◈ ERROR: Manifest not found ({MANIFEST_ID})")
        print("  └─ Run the import script first to create the manifest.")
        return

    assets  = manifest.get('assets', [])
    updated = False

    # Step 3: Pre-fetch AMFI data if needed
    amfi_navs = None
    if any(str(ALIAS_MATRIX.get(a['ticker'], '')).startswith('AMFI:') for a in assets):
        amfi_navs = fetch_amfi_navs()

    # Step 4: Sweep prices for each asset
    for asset in assets:
        ui_ticker     = asset['ticker']
        target_ticker = ALIAS_MATRIX.get(ui_ticker, ui_ticker)
        current_price = None

        try:
            # ── MUTUAL FUND PROTOCOL (AMFI) ──
            if str(target_ticker).startswith('AMFI:'):
                if not amfi_navs:
                    raise Exception("AMFI database unavailable")
                scheme_code = target_ticker.split(':')[1]
                if scheme_code in amfi_navs:
                    current_price = amfi_navs[scheme_code]
                else:
                    raise Exception(f"Scheme code {scheme_code} not found in AMFI")

            # ── EQUITY PROTOCOL (YAHOO FINANCE) ──
            else:
                yf_ticker   = f"{target_ticker}.NS" if '.' not in target_ticker else target_ticker
                stock       = yf.Ticker(yf_ticker)
                todays_data = stock.history(period="1d")
                if not todays_data.empty:
                    current_price = todays_data['Close'].iloc[-1]
                else:
                    current_price = stock.fast_info.get('last_price')

            # ── UPDATE ──
            if current_price is not None:
                rounded = round(float(current_price), 2)
                if asset.get('current_price') != rounded:
                    print(f"  └─ {ui_ticker}: ₹{asset.get('current_price', '?')} → ₹{rounded}")
                    asset['current_price'] = rounded
                    updated = True

        except Exception as e:
            print(f"  └─ [ERROR] {ui_ticker}: {e}")

    # Step 5: Commit updated manifest
    if updated:
        manifest['assets']       = assets
        manifest['last_updated'] = datetime.now().isoformat() + 'Z'
        if couch_put(manifest):
            print("◈ UPLINK COMPLETE: Vault synchronized.")
        else:
            print("◈ UPLINK FAILED: Could not write manifest.")
    else:
        print("◈ UPLINK COMPLETE: No price movements detected.")


# ─────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("==================================================")
    print("◈ AUSPEX DAEMON ONLINE (DUAL-SOURCE ACTIVE)")
    print(f"  Host:     {COUCH_HOST}")
    print(f"  User:     {USER_ID}")
    print(f"  Manifest: {MANIFEST_ID}")
    print("==================================================")

    while True:
        try:
            sync_market_data()
        except Exception as e:
            print(f"◈ CRITICAL UPLINK FAILURE: {e}")
        time.sleep(900)  # 15 minutes