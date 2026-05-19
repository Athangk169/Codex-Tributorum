"""
◈ CODEX TRIBUTORUM — DATABASE IMPORT SCRIPT
============================================
Wipes all three CouchDB databases and rebuilds them from scratch
with the correct document model and a CSV transaction export from
Google Sheets.

BEFORE RUNNING:
  1. Export your transactions from Google Sheets as CSV.
     Expected columns (in order):
       Date, Particulars, Amount, Category,
       Method (from account), Reimbersible, Reimbersment tag

  2. Set your CouchDB credentials below in the CONFIG section.
     Do NOT commit this file with real credentials.

  3. Run:  python import.py --csv your_transactions.csv
           python import.py --csv your_transactions.csv --dry-run

FLAGS:
  --csv <path>   Path to the Sheets CSV export (required)
  --dry-run      Parse and validate without writing to CouchDB
  --no-wipe      Skip the database wipe (for re-runs / top-ups)
"""

import sys
import csv
import json
import uuid
import argparse
import requests
from datetime import datetime, timedelta

# ─────────────────────────────────────────────────────────────
# ◈ CONFIG — edit this section before running
# ─────────────────────────────────────────────────────────────

COUCH_HOST = "http://localhost:5984"       # change if on Tailscale / Pi
COUCH_USER = "Sanguinius"                  # your CouchDB username
COUCH_PASS = "2C5h1c2a"          # your CouchDB password

PRIMARY_USER = "Sanguinius"

# Database names
DB_FINANCES    = "finances"
DB_METADATA    = "metadata_vault"
DB_INVESTMENTS = "investments_vault"

# ── Method → account_type + sub_account mapping ──
# Adjust if you have different method names in your CSV.
METHOD_MAP = {
    "UPI":    { "account_type": "Bank", "sub_account": "bank_hdfc" },
    "NEFT":   { "account_type": "Bank", "sub_account": "bank_hdfc" },
    "IMPS":   { "account_type": "Bank", "sub_account": "bank_hdfc" },
    "BANK":   { "account_type": "Bank", "sub_account": "bank_hdfc" },
    "CARD":   { "account_type": "Card", "sub_account": "card_SBI_cc" },
    "CASH":   { "account_type": "Cash", "sub_account": "cash_main" },
}

# ── Genesis snapshot (April 2026 closing = May 2026 opening) ──
GENESIS_MONTH = "2026-04"
GENESIS_BALANCES = {
    "Bank": { "bank_hdfc": 4591, "bank_sbi": 743 },
    "Card": { "card_SBI_cc": 5172 },
    "Cash": { "cash_main": 0 },
    "AR": 0,
    "Provisions": 0
}

# ─────────────────────────────────────────────────────────────
# ◈ METADATA DOCUMENTS
# ─────────────────────────────────────────────────────────────

METADATA_DOCS = [

    # ── Accounts ──
    {
        "_id": f"finance:account:{PRIMARY_USER}:bank_hdfc",
        "type": "finance:account",
        "user_id": PRIMARY_USER,
        "name": "HDFC Savings",
        "parent": "Bank",
        "is_default": True,
        "status": "active",
        "bank_name": "HDFC",
        "account_number": "",
        "minimum_balance": 0,
        "notes": "",
        "created": "2026-05-01T00:00:00.000Z",
        "closed_date": None
    },
    {
        "_id": f"finance:account:{PRIMARY_USER}:bank_sbi",
        "type": "finance:account",
        "user_id": PRIMARY_USER,
        "name": "SBI Savings",
        "parent": "Bank",
        "is_default": False,
        "status": "active",
        "bank_name": "SBI",
        "account_number": "",
        "minimum_balance": 0,
        "notes": "",
        "created": "2026-05-01T00:00:00.000Z",
        "closed_date": None
    },

    # ── Cards ──
    {
        "_id": f"finance:card:{PRIMARY_USER}:card_SBI_cc",
        "type": "finance:card",
        "user_id": PRIMARY_USER,
        "name": "SBI Elite",
        "parent": "Card",
        "is_default": True,
        "status": "active",
        "limit": 75000,
        "billing_day": 20,
        "due_day": 10,
        "due_month_offset": 1,
        "notes": "",
        "created": "2026-05-01T00:00:00.000Z",
        "closed_date": None
    },

    # ── Category classification config ──
    {
        "_id": f"finance:config:categories:{PRIMARY_USER}",
        "type": "finance:config",
        "user_id": PRIMARY_USER,
        "income_categories": ["Income", "Reimbursement Received"],
        "neutral_categories": [
            "Balance c/d", "Cash c/d", "Cash Deposit", "Cash Withdrawal",
            "Credit Card Bill", "Credit Card Payment",
            "Provision C/D", "Provision Sweep", "Provisions",
            "Card Cash Withdrawal", "Card to Bank"
        ],
        "expense_categories": [
            "Entertainment", "Food", "Fuel", "Investment",
            "Personal Care", "Rent", "Servicing", "Supplements",
            "Travel", "Uncategorized", "Utilities"
        ],
        # Entries that encode snapshot state — excluded from all processing
        "system_entries": [
            "Balance c/d",
            "Cash c/d",
            "Credit Card Bill",
            "Provision C/D",
            "Opening Balance",
            "Account Closure"
        ]
    },

    # ── Finance routes (system-wide, no user_id) ──
    {
        "_id": "finance:config:routes",
        "type": "finance:config",
        "routes": {
            "Cash Withdrawal":      { "from": "Bank",       "to": "Cash"       },
            "Cash Deposit":         { "from": "Cash",       "to": "Bank"       },
            "Credit Card Payment":  { "from": "Bank",       "to": "Card"       },
            "Provisions":           { "from": "Bank",       "to": "Provisions" },
            "Provision Sweep":      { "from": "Provisions", "to": "Bank"       },
            "Card Cash Withdrawal": { "from": "Card",       "to": "Cash"       },
            "Card to Bank":         { "from": "Card",       "to": "Bank"       }
        }
    },

    # ── Analytics filters (system-wide, no user_id) ──
    {
        "_id": "finance:config:analytics",
        "type": "finance:config",
        "do_not_track": [
            "Balance c/d", "Cash c/d", "Credit Card Bill", "Provision C/D",
            "Opening Balance", "Account Closure",
            "Cash Deposit", "Cash Withdrawal",
            "Credit Card Payment", "Provisions", "Provision Sweep",
            "Card Cash Withdrawal", "Card to Bank"
        ]
    },

    # ── Category rules (auto-generated from Finances_-_cat_lookup.csv) ──
    {
        "_id": f"finance:rule:{PRIMARY_USER}:food",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Food", "is_active": True,
        "keywords": ["TOFU","MILK","SOFTY","VADAPAV","PIZZA","DINNER","LUNCH","BREAKFAST","BURGER","CHIPS","TEA","COFFEE","ICECREAME","PANIPURI","GROCERIES","MAGGI","EGGS","PATTICE","SNACKS","FRUITS","AMUL TRU","MAAZA","MINUTE MAID","MESS","KFC","NACHOS","SPARKLING WATER","THUMBS UP","SEV KHAMNI","GUJARATI THALI","MOUNTAIN DEW","PEPSI","DAL PAKWAN","MCDONALD'S","MISAL","APPY","CHOCOBAR","BHAKARWADI","ICE CREAM","GARLIC BREAD","CUP NOODLES","COKE","MIRANDA","ICECREAM","CROISSANT","SODA","SAMOSA","POHE","FALOODA","GRAPES","OATS","CUP OATS","BREAD","GARLIC BUTTER","BUTTER","BISCUIT","CHEESE","MAYONNAISE","LETTUCE","MEDU VADA","BURGER KING","SUGARCANE JUICE","YOGURT","LASSI","WATER","PARTY","SWIGGY","ZOMATO","ZEPTO","DOMINOS","BLINKIT","MUNCH","MONSTER","CHAAT"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:supplements",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Supplements", "is_active": True,
        "keywords": ["PROTEIN","CREATINE","MULTIVITAMIN","FISH OIL"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:utilities",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Utilities", "is_active": True,
        "keywords": ["MAID","ELECTRICITY","GAS","WIFI","SPOTIFY","FRIDGE REPAIR","TOILET CLEANER","RECHARGE","ELECTRICITY BILL","LAUNDRY"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:fuel",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Fuel", "is_active": True,
        "keywords": ["PETROL","FUEL","CNG"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:income",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Income", "is_active": True,
        "keywords": ["INCOME","HDFC CARD CASHBACK"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:balance_cd",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Balance c/d", "is_active": True,
        "keywords": ["BALANCE C/D"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:investment",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Investment", "is_active": True,
        "keywords": ["SIP","STOCK SIP"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:servicing",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Servicing", "is_active": True,
        "keywords": ["SERVICING","PORTER","REPAIR","THERMAL PASTE"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:travel",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Travel", "is_active": True,
        "keywords": ["UBER","BUS TICKET","TRAIN TICKET","RAPIDO","TRAIN","CAB","RICKSHAW","METRO","TAXI","HOTEL","FLIGHT","AIRPORT CAB"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:rent",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Rent", "is_active": True,
        "keywords": ["RENT"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:provisions",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Provisions", "is_active": True,
        "keywords": ["PROVISION"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:personal_care",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Personal Care", "is_active": True,
        "keywords": ["MOUTHWASH","LOOFAH","HAIRCUT","VASLINE","SHAMPOO","DEO","MYNTRA","MOISTURIZER","DENTIST","CONDITIONER","SUNSCREEN","SHIRT","CLOTHES","SHOWER GEL"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:entertainment",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Entertainment", "is_active": True,
        "keywords": ["MOVIE"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:cash_withdrawal",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Cash Withdrawal", "is_active": True,
        "keywords": ["CASH WITHDRAWAL"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:cash_cd",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Cash c/d", "is_active": True,
        # System entry — genesis carry-forward for Cash balance.
        # Excluded from all transaction processing via system_entries.
        "keywords": ["CASH C/D"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:reimbursement_received",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Reimbursement Received", "is_active": True,
        "keywords": ["REIMBURSEMENT"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:credit_card_payment",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Credit Card Payment", "is_active": True,
        "keywords": ["CREDIT CARD PAYMENT","CC PAYMENT"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:credit_card_bill",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Credit Card Bill", "is_active": True,
        "keywords": ["CARD C/D"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:provision_sweep",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Provision Sweep", "is_active": True,
        "keywords": ["PROVISION SWEEP"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:provision_cd",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Provision C/D", "is_active": True,
        "keywords": ["PROVISION C/D"],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    {
        "_id": f"finance:rule:{PRIMARY_USER}:uncategorized",
        "type": "finance:rule", "user_id": PRIMARY_USER,
        "category_name": "Uncategorized", "is_active": True,
        "keywords": [],
        "created": "2026-05-01T00:00:00.000Z", "updated": "2026-05-01T00:00:00.000Z"
    },
    # ── Genesis snapshot ──
    {
        "_id": f"finance:snapshot:{PRIMARY_USER}:{GENESIS_MONTH}",
        "type": "finance:snapshot",
        "user_id": PRIMARY_USER,
        "month": GENESIS_MONTH,
        "is_genesis": True,
        "balances": GENESIS_BALANCES,
        "created": "2026-05-01T00:00:00.000Z"
    },
]

# ── Investments manifest ──
INVESTMENTS_DOCS = [
    {
        "_id": f"finance:investments:current:{PRIMARY_USER}",
        "type": "finance:investments:manifest",
        "user_id": PRIMARY_USER,
        "assets": [
            {
                "id": "ast_1",
                "ticker": "MUTF_IN:NIPP_INDI_SMAL_1AOBL3E",
                "name": "Nippon India Small Cap",
                "avg_price": 176.04,
                "shares": 189.15,
                "current_price": 192.33
            },
            {
                "id": "ast_2",
                "ticker": "BEL",
                "name": "Bharat Electronics",
                "avg_price": 303.32,
                "shares": 14,
                "current_price": 427.15
            },
            {
                "id": "ast_3",
                "ticker": "NTPC",
                "name": "NTPC Limited",
                "avg_price": 425.75,
                "shares": 1,
                "current_price": 394.05
            },
            {
                "id": "ast_4",
                "ticker": "MODEFENCE",
                "name": "Motilal Oswal Defence",
                "avg_price": 73.31,
                "shares": 18,
                "current_price": 100.09
            }
        ],
        "last_updated": datetime.now().isoformat() + "Z"
    }
]

# ─────────────────────────────────────────────────────────────
# ◈ HELPERS
# ─────────────────────────────────────────────────────────────

session = requests.Session()
session.auth = (COUCH_USER, COUCH_PASS)
session.headers.update({"Content-Type": "application/json"})

def couch(method, path, data=None):
    url = f"{COUCH_HOST}/{path}"
    resp = session.request(method, url, json=data)
    return resp

def wipe_and_create(db_name):
    print(f"  └─ Wiping {db_name}...")
    couch("DELETE", db_name)
    r = couch("PUT", db_name)
    if r.status_code not in (201, 202):
        print(f"  └─ ERROR creating {db_name}: {r.text}")
        sys.exit(1)
    print(f"  └─ Created {db_name}")

def bulk_insert(db_name, docs, label):
    if not docs:
        return
    r = couch("POST", f"{db_name}/_bulk_docs", {"docs": docs})
    results = r.json()
    errors = [x for x in results if "error" in x]
    print(f"  └─ {label}: {len(docs) - len(errors)} written, {len(errors)} errors")
    for e in errors:
        print(f"      ERROR: {e}")

def parse_date(raw):
    """Parse DD/MM/YYYY HH:MM or DD/MM/YYYY into YYYY-MM-DD."""
    raw = raw.strip()
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {raw!r}")

def parse_amount(raw):
    """Parse amount string to float."""
    cleaned = raw.strip().replace(",", "").replace("₹", "").strip()
    return float(cleaned)

def resolve_method(method_raw):
    """Map CSV method field to account_type and sub_account."""
    key = method_raw.strip().upper()
    if key in METHOD_MAP:
        return METHOD_MAP[key]
    # Fallback: if contains 'CARD' use card, else bank
    if "CARD" in key:
        return METHOD_MAP["CARD"]
    if "CASH" in key:
        return METHOD_MAP["CASH"]
    return METHOD_MAP["UPI"]

def make_txn_id(user_id, date_str, suffix):
    return f"txn:{user_id}:{date_str}:{suffix}"

# Categories that should be skipped entirely (genesis-only entries)
SYSTEM_ENTRIES = {
    "Balance c/d", "Cash c/d", "Credit Card Bill", "Provision C/D",
    "Account Closure"
}

# ─────────────────────────────────────────────────────────────
# ◈ CSV PARSER
# ─────────────────────────────────────────────────────────────

def parse_csv(filepath):
    """
    Parse the Google Sheets CSV export into transaction documents.
    Returns (valid_txns, skipped_count, error_rows).
    """
    txns = []
    skipped = 0
    errors = []

    with open(filepath, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)

        # Normalise header names (strip whitespace, lowercase for matching)
        fieldnames = [n.strip() for n in reader.fieldnames or []]
        print(f"  └─ CSV columns detected: {fieldnames}")

        for i, row in enumerate(reader, start=2):
            # Strip all values
            row = {k.strip(): v.strip() for k, v in row.items()}

            try:
                raw_date        = row.get("Date", "")
                description     = row.get("Particulars", "").strip()
                raw_amount      = row.get("Amount", "0")
                category        = row.get("Category", "Uncategorized").strip()
                method          = row.get("Method (from account)", "UPI").strip()
                reimbursible    = row.get("Reimbersible", "No").strip().lower()
                reimb_tag       = row.get("Reimbersment tag", "").strip() or None

                # Skip system/genesis entries
                if category in SYSTEM_ENTRIES:
                    skipped += 1
                    continue

                # Skip empty rows
                if not raw_date or not raw_amount or not description:
                    skipped += 1
                    continue

                date_str = parse_date(raw_date)
                amount   = parse_amount(raw_amount)
                account  = resolve_method(method)

                # reimbursement_tag: use tag if reimbursible, else null
                if reimbursible == "yes":
                    r_tag = reimb_tag or "untagged"
                else:
                    r_tag = None

                suffix = uuid.uuid4().hex[:8]
                txn_id = make_txn_id(PRIMARY_USER, date_str, suffix)

                txns.append({
                    "_id":              txn_id,
                    "type":             "transaction",
                    "user_id":          PRIMARY_USER,
                    "date":             date_str,
                    "description":      description,
                    "amount":           amount,
                    "category":         category,
                    "account_type":     account["account_type"],
                    "sub_account":      account["sub_account"],
                    "reimbursement_tag": r_tag,
                    "notes":            None,
                    "created_at":       datetime.now().isoformat() + "Z"
                })

            except Exception as e:
                errors.append({ "row": i, "data": dict(row), "error": str(e) })

    return txns, skipped, errors

# ─────────────────────────────────────────────────────────────
# ◈ MAIN
# ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Codex Tributorum — DB Import Script")
    parser.add_argument("--csv",      required=True, help="Path to Google Sheets CSV export")
    parser.add_argument("--dry-run",  action="store_true", help="Parse only, do not write to DB")
    parser.add_argument("--no-wipe",  action="store_true", help="Skip database wipe")
    args = parser.parse_args()

    print("\n==================================================")
    print("◈ CODEX TRIBUTORUM — DATABASE IMPORT")
    print("==================================================\n")

    # ── 1. Parse CSV ──
    print("[ STEP 1 ] Parsing transaction CSV...")
    txns, skipped, errors = parse_csv(args.csv)
    print(f"  └─ {len(txns)} transactions parsed")
    print(f"  └─ {skipped} system entries skipped")
    if errors:
        print(f"  └─ {len(errors)} PARSE ERRORS:")
        for e in errors:
            print(f"      Row {e['row']}: {e['error']} — {e['data']}")
        print("\n  Fix the errors above before proceeding.")
        if not args.dry_run:
            sys.exit(1)

    if args.dry_run:
        print("\n[ DRY RUN ] No changes written. Remove --dry-run to execute.")
        # Print sample transaction for verification
        if txns:
            print("\n[ SAMPLE TRANSACTION ]")
            print(json.dumps(txns[0], indent=2))
        return

    # ── 2. Wipe and recreate databases ──
    if not args.no_wipe:
        print("\n[ STEP 2 ] Wiping databases...")
        for db in [DB_FINANCES, DB_METADATA, DB_INVESTMENTS]:
            wipe_and_create(db)
    else:
        print("\n[ STEP 2 ] Skipping wipe (--no-wipe)")

    # ── 3. Insert metadata ──
    print("\n[ STEP 3 ] Writing metadata documents...")
    bulk_insert(DB_METADATA, METADATA_DOCS, "Metadata")

    # ── 4. Insert investment manifest ──
    print("\n[ STEP 4 ] Writing investment documents...")
    bulk_insert(DB_INVESTMENTS, INVESTMENTS_DOCS, "Investments")

    # ── 5. Insert transactions ──
    print("\n[ STEP 5 ] Writing transactions...")
    # Insert in batches of 200 to avoid overwhelming CouchDB
    batch_size = 200
    total_written = 0
    for i in range(0, len(txns), batch_size):
        batch = txns[i:i + batch_size]
        bulk_insert(DB_FINANCES, batch, f"Batch {i // batch_size + 1}")
        total_written += len(batch)

    # ── 6. Summary ──
    print(f"\n==================================================")
    print(f"◈ IMPORT COMPLETE")
    print(f"  Metadata documents : {len(METADATA_DOCS)}")
    print(f"  Investment documents: {len(INVESTMENTS_DOCS)}")
    print(f"  Transactions        : {total_written}")
    print(f"  Skipped (system)    : {skipped}")
    print(f"==================================================\n")
    print("Next step: deploy the new engine.js, then open the app.")


if __name__ == "__main__":
    main()