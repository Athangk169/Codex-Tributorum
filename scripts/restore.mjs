// ─────────────────────────────────────────────────────────────
// restore.mjs — rebuild CouchDB from a data-tithe workbook
//
// Counterpart to src/utils/dataTithe.js. Reads a
// codex_tributorum_tithe_*.xlsx export and bulk-writes every
// document back into CouchDB, recreating the three databases
// (finances / metadata_vault / investments_vault) if missing.
//
// Usage:
//   node scripts/restore.mjs <tithe.xlsx> <couch-url> [--overwrite] [--dry-run]
//
//   <couch-url>   e.g. http://127.0.0.1:5984 or the tailnet /db proxy.
//   credentials   via env: COUCH_USER + COUCH_PASS (admin account).
//                 Never hardcode credentials in this file.
//   --overwrite   docs that already exist are fetched and replaced
//                 (default: existing docs are left alone and counted
//                 as conflicts — safe for topping up a partial db).
//   --dry-run     parse the workbook and report what WOULD be
//                 written; no network calls at all.
//
// Restore fidelity notes (mirrors the export's caveats):
//   * _rev columns are dropped — CouchDB mints fresh revisions.
//   * Cells that look like JSON ('[' / '{' prefix) are parsed back
//     into arrays/objects; everything else stays a scalar.
//   * null fields were exported as '' and come back as '' — the
//     app treats both as empty.
//   * CouchDB _users accounts, _security objects and design docs
//     are NOT in the tithe; recreate those as per SERVER.md.
// ─────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const SHEET_PREFIX_TO_DB = {
  'FIN':  'finances',
  'META': 'metadata_vault',
  'INV':  'investments_vault',
};

const BATCH = 500;

// ── CLI ──
const args    = process.argv.slice(2);
const flags   = new Set(args.filter(a => a.startsWith('--')));
const [file, couchUrl] = args.filter(a => !a.startsWith('--'));
const dryRun    = flags.has('--dry-run');
const overwrite = flags.has('--overwrite');

if (!file || (!couchUrl && !dryRun)) {
  console.error('Usage: node scripts/restore.mjs <tithe.xlsx> <couch-url> [--overwrite] [--dry-run]');
  console.error('       admin credentials via env COUCH_USER / COUCH_PASS');
  process.exit(1);
}

const base = couchUrl ? couchUrl.replace(/\/+$/, '') : null;

const authHeader = () => {
  const { COUCH_USER, COUCH_PASS } = process.env;
  if (!COUCH_USER || !COUCH_PASS) {
    console.error('Missing COUCH_USER / COUCH_PASS environment variables.');
    process.exit(1);
  }
  return 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');
};

const couch = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Authorization': authHeader(),
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

// ── Parse workbook back into docs, grouped by target db ──
const reviveCell = (val) => {
  if (typeof val !== 'string') return val;
  if (/^[[{]/.test(val)) {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
};

const wb = XLSX.read(readFileSync(file), { type: 'buffer' });
const docsByDb = new Map(Object.values(SHEET_PREFIX_TO_DB).map(db => [db, []]));

for (const sheetName of wb.SheetNames) {
  const prefix = sheetName.split('·')[0];
  const dbName = SHEET_PREFIX_TO_DB[prefix];
  if (!dbName) continue; // ARCHIVUM summary sheet, or anything foreign

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]); // skips empty cells
  for (const row of rows) {
    const doc = {};
    for (const [key, val] of Object.entries(row)) {
      if (key === '_rev') continue; // CouchDB assigns fresh revisions
      doc[key] = reviveCell(val);
    }
    if (!doc._id) {
      console.warn(`  ! skipping row without _id on sheet ${sheetName}`);
      continue;
    }
    docsByDb.get(dbName).push(doc);
  }
}

// ── Report / write ──
let grandTotal = 0;
for (const [dbName, docs] of docsByDb) {
  grandTotal += docs.length;
  console.log(`${dbName}: ${docs.length} docs${dryRun ? ' (dry run — not written)' : ''}`);
}
if (dryRun) {
  const sample = [...docsByDb.values()].flat()[0];
  console.log('\nSample reconstructed doc:');
  console.log(JSON.stringify(sample, null, 2));
  console.log(`\nDry run complete — ${grandTotal} docs parsed, nothing written.`);
  process.exit(0);
}

const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

for (const [dbName, docs] of docsByDb) {
  if (docs.length === 0) continue;

  // Ensure the database exists (201 created / 412 already there).
  const created = await couch('PUT', `/${dbName}`);
  if (created.status !== 201 && created.status !== 412) {
    console.error(`Cannot create/reach ${dbName}: HTTP ${created.status}`, created.data);
    process.exit(1);
  }

  let ok = 0, conflicts = 0, failed = 0;
  for (const batch of chunk(docs, BATCH)) {
    const { status, data } = await couch('POST', `/${dbName}/_bulk_docs`, { docs: batch });
    if (status !== 201) {
      console.error(`_bulk_docs failed for ${dbName}: HTTP ${status}`, data);
      process.exit(1);
    }

    const conflicted = [];
    data.forEach((r, i) => {
      if (r.ok) ok++;
      else if (r.error === 'conflict') conflicted.push(batch[i]);
      else { failed++; console.warn(`  ! ${r.id}: ${r.error} — ${r.reason}`); }
    });

    if (conflicted.length && overwrite) {
      // Fetch current revs and retry as replacements.
      const retry = [];
      for (const doc of conflicted) {
        const head = await couch('GET', `/${dbName}/${encodeURIComponent(doc._id)}`);
        if (head.status === 200) retry.push({ ...doc, _rev: head.data._rev });
        else { failed++; console.warn(`  ! ${doc._id}: conflict but current rev unreadable`); }
      }
      if (retry.length) {
        const second = await couch('POST', `/${dbName}/_bulk_docs`, { docs: retry });
        second.data.forEach((r) => {
          if (r.ok) ok++;
          else { failed++; console.warn(`  ! ${r.id}: ${r.error} on overwrite — ${r.reason}`); }
        });
      }
    } else {
      conflicts += conflicted.length;
    }
  }

  const parts = [`${ok} written`];
  if (conflicts) parts.push(`${conflicts} already existed (rerun with --overwrite to replace)`);
  if (failed)    parts.push(`${failed} FAILED`);
  console.log(`${dbName}: ${parts.join(', ')}`);
}

console.log('\nRestore complete. Remember: user accounts and db _security are not in the tithe (see SERVER.md).');
