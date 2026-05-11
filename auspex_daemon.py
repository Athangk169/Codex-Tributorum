import yfinance as yf
import requests
import time
from datetime import datetime
import sys

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ◈ COUCHDB UPLINK CREDENTIALS ◈
DB_URL = "http://Athang:2C5h1c2a@192.168.29.101:5984/investments_vault/current_holdings"

# ◈ THE AMFI ALIAS MATRIX ◈
# Maps your UI names to their official 6-digit AMFI Scheme Code for Mutual Funds.
# 118778 is the official AMFI code for: Nippon India Small Cap Fund - Direct Plan - Growth
ALIAS_MATRIX = {
    "MUTF_IN:NIPP_INDI_SMAL_1AOBL3E": "AMFI:118778",
}

def fetch_amfi_navs():
    """Fetches the official daily NAV for all Indian Mutual Funds directly from AMFI."""
    print("  └─ Fetching official AMFI Mutual Fund database...")
    navs = {}
    try:
        # The official daily text file published by AMFI
        resp = requests.get("https://www.amfiindia.com/spages/NAVAll.txt", timeout=10)
        for line in resp.text.split("\n"):
            parts = line.split(";")
            # The scheme code is always the first item on the line
            if len(parts) >= 5 and parts[0].isdigit():
                scheme_code = parts[0].strip()
                nav = parts[4].strip()
                try:
                    navs[scheme_code] = float(nav)
                except ValueError:
                    pass
        return navs
    except Exception as e:
        print(f"  └─ [AMFI API ERROR] {e}")
        return None

def sync_market_data():
    print(f"\n[ {datetime.now().strftime('%H:%M:%S')} ] ◈ INITIATING DUAL-SOURCE UPLINK...")
    
    try:
        resp = requests.get(DB_URL)
        if resp.status_code != 200:
            print(f"◈ ERROR: VAULT ACCESS DENIED. (Status {resp.status_code})")
            return
            
        doc = resp.json()
        assets = doc.get("assets", [])
        updated = False
        
        # 1. Pre-fetch AMFI data ONLY IF we have mutual funds in the manifest
        amfi_navs = None
        if any(str(ALIAS_MATRIX.get(a["ticker"], "")).startswith("AMFI:") for a in assets):
            amfi_navs = fetch_amfi_navs()
        
        # 2. Sweep the market for each asset
        for asset in assets:
            ui_ticker = asset["ticker"]
            target_ticker = ALIAS_MATRIX.get(ui_ticker, ui_ticker)
            current_price = None
            
            try:
                # ── MUTUAL FUND PROTOCOL (AMFI) ──
                if str(target_ticker).startswith("AMFI:"):
                    if not amfi_navs:
                        raise Exception("AMFI Database unavailable")
                    
                    scheme_code = target_ticker.split(":")[1]
                    if scheme_code in amfi_navs:
                        current_price = amfi_navs[scheme_code]
                    else:
                        raise Exception(f"Scheme code {scheme_code} not found in AMFI.")
                        
                # ── EQUITY PROTOCOL (YAHOO FINANCE) ──
                else:
                    yf_ticker = f"{target_ticker}.NS" if "." not in target_ticker else target_ticker
                    stock = yf.Ticker(yf_ticker)
                    current_price = stock.fast_info['last_price']
                
                # Check if the price actually moved before writing to the database
                if current_price and asset.get("ltp") != round(current_price, 2):
                    asset["ltp"] = round(current_price, 2)
                    updated = True
                    print(f"  └─ [OK] {ui_ticker} updated to ₹{asset['ltp']}")
                else:
                    print(f"  └─ [--] {ui_ticker} unchanged at ₹{asset['ltp']}")
                    
            except Exception as e:
                print(f"  └─ [FAIL] Could not fetch {ui_ticker} -> {e}")

        # 3. Commit new prices back to the Vault
        if updated:
            doc["assets"] = assets
            put_resp = requests.put(DB_URL, json=doc)
            
            if put_resp.status_code == 201:
                print("◈ UPLINK COMPLETE: Vault synchronized.")
            else:
                print(f"◈ UPLINK FAILED: Write error {put_resp.status_code}")
        else:
            print("◈ UPLINK COMPLETE: No price movements detected.")
            
    except Exception as e:
        print(f"◈ CRITICAL UPLINK FAILURE: {e}")

if __name__ == "__main__":
    print("==================================================")
    print("◈ AUSPEX DAEMON ONLINE (DUAL-SOURCE ACTIVE)")
    print("==================================================")
    
    while True:
        sync_market_data()
        time.sleep(900)