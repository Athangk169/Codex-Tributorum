// ─────────────────────────────────────────────────────────────
// dataTithe — full-archive Excel export
//
// Dumps every document from the three local PouchDB replicas
// (finances / metadata_vault / investments_vault) into a single
// multi-sheet .xlsx workbook and hands it to the browser as a
// download. The local replicas are a complete mirror of the
// remote CouchDB, so this works offline and needs no server
// endpoint.
//
// Docs are grouped into sheets by their `type` field (one sheet
// per doc type, prefixed by source db). Nested objects/arrays
// are JSON-stringified into their cell so nothing is lost —
// the workbook doubles as a restorable backup, not just a
// human-readable report.
//
// SheetJS is imported dynamically so its weight is only paid
// when the tithe is actually extracted.
//
// ── Privilege note ──
// `canExtractTithe` gates the UI to the Sanguinius account,
// matching the existing convention (rule seeding already treats
// Sanguinius as the canonical/admin operator). This is a UI
// convenience, not a security boundary: every synced client
// already holds the full replicas locally.
// ─────────────────────────────────────────────────────────────

const TITHE_WARDENS = ['Sanguinius'];

export const canExtractTithe = (username) => TITHE_WARDENS.includes(username);

// Excel sheet names: max 31 chars, no  \ / ? * [ ] :  and unique.
const sheetNameFor = (raw, taken) => {
  let name = String(raw || 'MISC')
    .replace(/[\\/?*[\]:]/g, '_')
    .toUpperCase()
    .slice(0, 31) || 'MISC';
  let candidate = name;
  let n = 2;
  while (taken.has(candidate)) {
    const suffix = `~${n++}`;
    candidate = name.slice(0, 31 - suffix.length) + suffix;
  }
  taken.add(candidate);
  return candidate;
};

// Flatten one doc into a spreadsheet row: scalars pass through,
// nested structures are serialised so they survive a round-trip.
const toRow = (doc) => {
  const row = {};
  for (const [key, val] of Object.entries(doc)) {
    if (val === null || val === undefined) {
      row[key] = '';
    } else if (typeof val === 'object') {
      row[key] = JSON.stringify(val);
    } else {
      row[key] = val;
    }
  }
  return row;
};

const dumpDb = async (db) => {
  if (!db) return [];
  const res = await db.allDocs({ include_docs: true });
  return res.rows
    .map(r => r.doc)
    .filter(d => d && !d._id.startsWith('_design/'));
};

export async function extractFullTithe(dbs, username) {
  const XLSX = await import('xlsx');

  const sources = [
    { prefix: 'FIN',  label: 'finances',          db: dbs?.txns },
    { prefix: 'META', label: 'metadata_vault',    db: dbs?.meta },
    { prefix: 'INV',  label: 'investments_vault', db: dbs?.inv  },
  ];

  const wb    = XLSX.utils.book_new();
  const taken = new Set();
  const counts = [];

  // Summary sheet first so the workbook opens on it.
  const summaryRows = [];
  const summarySheet = XLSX.utils.json_to_sheet([{}]);
  XLSX.utils.book_append_sheet(wb, summarySheet, sheetNameFor('ARCHIVUM', taken));

  for (const { prefix, label, db } of sources) {
    const docs = await dumpDb(db);
    counts.push({ database: label, documents: docs.length });

    // Group by doc type → one sheet per type, so each sheet has
    // homogeneous columns instead of one sparse mega-table.
    const byType = new Map();
    for (const doc of docs) {
      const type = doc.type || 'untyped';
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(toRow(doc));
    }

    for (const [type, rows] of [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const name = sheetNameFor(`${prefix}·${type.replace(/^finance:/, '')}`, taken);
      XLSX.utils.book_append_sheet(wb, ws, name);
      summaryRows.push({ database: label, doc_type: type, sheet: name, rows: rows.length });
    }
  }

  // Rebuild the summary sheet now that counts are known.
  const stamp = new Date().toISOString();
  const header = [
    { database: '◈ CODEX TRIBUTORUM — FULL DATA-TITHE ◈' },
    { database: 'extracted', doc_type: stamp },
    { database: 'operator',  doc_type: username || 'unknown' },
    {},
    ...counts.map(c => ({ database: c.database, doc_type: 'total docs', rows: c.documents })),
    {},
  ];
  const filled = XLSX.utils.json_to_sheet([...header, ...summaryRows],
    { header: ['database', 'doc_type', 'sheet', 'rows'], skipHeader: true });
  wb.Sheets[wb.SheetNames[0]] = filled;

  const day = stamp.slice(0, 10);
  XLSX.writeFile(wb, `codex_tributorum_tithe_${day}.xlsx`);

  return counts.reduce((s, c) => s + c.documents, 0);
}
