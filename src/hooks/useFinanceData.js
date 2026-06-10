import { useState, useEffect } from "react";
import PouchDB from "pouchdb/dist/pouchdb";
import {
  FinanceEngine,
  CardEngine,
  AccountEngine,
  AnalyticsEngine,
  ObligationsEngine,
  CategorizationEngine
} from "../utils/engine";
import { couchEndpoint } from "../utils/couchAuth";

// ─────────────────────────────────────────────────────────────
// useFinanceData
//
// Manages PouchDB initialisation, remote CouchDB sync, and all
// data refresh logic. Returns financeData, isLoading, error,
// syncLed, and raw db handles for slides that write directly.
//
// Sync LED states:
//   'warn' — initial / awaiting first sync / error
//   'ok'   — data successfully synced
//
// refreshData is debounced on sync change events (600ms) to
// avoid cascading calls during bulk sync. The initial load on
// mount runs immediately without debounce.
// ─────────────────────────────────────────────────────────────

export const useFinanceData = (credentials) => {
  const [financeData, setFinanceData] = useState(null);
  const [isLoading, setIsLoading]     = useState(true);
  const [error, setError]             = useState(null);
  // Seed from navigator.onLine so an app launched without connectivity
  // shows "NO SIGNAL" immediately — without waiting for PouchDB's first
  // failed sync attempt to fire the 'paused' event a few seconds later.
  const [syncLed, setSyncLed]         = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'warn'
  );
  const [dbs, setDbs]                 = useState({ txns: null, meta: null, inv: null });

  useEffect(() => {
    if (!credentials?.username) {
      console.log("◈ [HOOK] ABORTING: Missing credentials");
      return;
    }

    // Only the username is needed at this layer — auth is carried by
    // the HttpOnly AuthSession cookie set by BootScreen's /_session
    // POST. The password no longer touches React state past boot.
    const { username } = credentials;

    // ── Local PouchDB instances ──
    const dbTransactions = new PouchDB("finances");
    const dbMetadata     = new PouchDB("metadata_vault");
    const dbInvestments  = new PouchDB("investments_vault");

    setDbs({ txns: dbTransactions, meta: dbMetadata, inv: dbInvestments });

    // ── Remote sync setup ──
    //
    // App and CouchDB are now same-origin HTTPS (tailscale serve handles
    // both `/` and `/db` on the same hostname), so the HttpOnly
    // AuthSession cookie set by BootScreen's /_session call is reliably
    // attached to every sync request via `credentials: 'include'`. The
    // in-memory Basic-Auth fallback that used to live here has been
    // removed — the password no longer needs to be kept in React state
    // for the lifetime of the session, which closes off the only path
    // by which a future XSS could exfiltrate the password.
    const setupSync = (db, dbName) => {
      const savedHost = localStorage.getItem('COGITATOR_UPLINK_HOST') || 'laptop-lg23d2mc.taild8bd6e.ts.net/db';
      // Same normalisation as couchAuth — strips trailing slashes and
      // prepends the protocol if absent. Avoids double-slash URLs.
      const remoteUrl = `${couchEndpoint(savedHost)}/${dbName}`;

      const cookieFetch = (url, opts = {}) =>
        fetch(url, { ...opts, credentials: 'include' });

      const remote = new PouchDB(remoteUrl, {
        skip_setup: true,
        // Auth flows entirely through the HttpOnly AuthSession cookie.
        fetch: cookieFetch,
      });

      return db.sync(remote, {
        live:  true,
        retry: true,
      });
    };

    const syncTxns = setupSync(dbTransactions, "finances");
    const syncMeta = setupSync(dbMetadata,     "metadata_vault");
    const syncInv  = setupSync(dbInvestments,  "investments_vault");

    // ── Sync event handlers ──
    // Three states:
    //   'ok'      — actively syncing, data flowing
    //   'offline' — no network/CouchDB, local cache intact (expected away from home)
    //   'error'   — genuine failure, something is actually broken
    const handleSyncPaused = (err) => err ? setSyncLed('offline') : setSyncLed('ok');
    const handleSyncChange = ()    => setSyncLed('ok');
    const handleSyncError  = (err) => {
      console.error("◈ UPLINK FAILURE:", err.message || err);
      const msg = (err.message || err.name || '').toLowerCase();
      const isOffline =
        msg.includes('econnrefused') ||
        msg.includes('enotfound') ||
        msg.includes('network') ||
        msg.includes('fetch') ||
        msg.includes('timeout') ||
        err.name === 'unknown_error';
      setSyncLed(isOffline ? 'offline' : 'error');
    };

    [syncTxns, syncMeta, syncInv].forEach(s => {
      s.on('active',  () => {});           // no state change on retry attempt
      s.on('paused',  handleSyncPaused);
      s.on('change',  handleSyncChange);
      s.on('error',   handleSyncError);
      s.on('denied',  handleSyncError);
    });

    // Browser-level connectivity events. PouchDB's sync events tell us
    // about CouchDB reachability, but the browser knows about device-
    // level connectivity changes (wifi dropped, airplane mode toggled)
    // before any sync attempt would fire. Reflect those immediately so
    // the uplink LED tracks reality without a polling delay.
    const handleOnline  = () => setSyncLed('warn');   // retry begins; 'change' will promote to 'ok'
    const handleOffline = () => setSyncLed('offline');
    if (typeof window !== 'undefined') {
      window.addEventListener('online',  handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    // ── Direct health-check probe ──
    // `navigator.onLine` only tells us about device connectivity, not
    // whether CouchDB itself is reachable. If the phone has wifi but
    // Tailscale is off (or the laptop is asleep, or CouchDB is down),
    // PouchDB's sync attempt can take 30s+ to time out before
    // `paused(err)` finally fires — that's far too slow.
    //
    // Probe `${endpoint}/` directly with a 4s abort timeout. CouchDB
    // returns 401/200 on the welcome route, so any HTTP response — even
    // 401 — means the server is reachable. A network-level failure
    // (DNS, connect refused, abort) means it isn't.
    //
    // While offline, re-probe every 15s. As soon as a probe succeeds,
    // we hand back to PouchDB's sync events (which will fire 'change'
    // → 'ok' once data flows).
    const savedHost = localStorage.getItem('COGITATOR_UPLINK_HOST') || 'laptop-lg23d2mc.taild8bd6e.ts.net/db';
    const probeUrl  = `${couchEndpoint(savedHost)}/`;

    const probeOnce = async () => {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      try {
        await fetch(probeUrl, {
          method: 'GET',
          credentials: 'include',
          signal: ctrl.signal,
          cache: 'no-store',
        });
        // Any HTTP response (200, 401, 403, 404, …) = server is talking
        // back. Only network-level errors throw here.
        setSyncLed(prev => (prev === 'offline' ? 'warn' : prev));
        return true;
      } catch (_e) {
        setSyncLed('offline');
        return false;
      } finally {
        clearTimeout(timer);
      }
    };

    probeOnce();
    const probeIv = setInterval(probeOnce, 15000);

    // ── Seeding: copy Sanguinius rules to a new user on first login ──
    const categorySlug = (categoryName) =>
      String(categoryName || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const seedInitialCategoriesFromAdmin = async (userId, metadataDB) => {
      if (!userId || userId === 'Sanguinius') return;

      try {
        const existingRules = await metadataDB.allDocs({ include_docs: true });
        const userRules = existingRules.rows.filter(r =>
          r.doc.type === 'finance:rule' &&
          r.doc.user_id === userId &&
          r.doc.is_system !== true
        );

        if (userRules.length > 0) return; // already seeded

        console.log(`[SEED] First login for ${userId} — copying from Sanguinius`);

        // Copy category rules
        const adminRules = existingRules.rows.filter(r =>
          (r.doc.type === 'finance:rule' || r.doc.type === 'category_rule') &&
          (r.doc.user_id === 'Sanguinius' || !r.doc.user_id)
        );

        for (const rule of adminRules) {
          try {
            const categoryName = rule.doc.category_name;
            if (!categoryName) continue;

            await metadataDB.put({
              _id:           `finance:rule:${userId}:${categorySlug(categoryName)}`,
              type:          'finance:rule',
              user_id:       userId,
              category_name: categoryName,
              keywords:      [...new Set(rule.doc.keywords || [])],
              is_active:     rule.doc.is_active !== false,
              created:       new Date().toISOString(),
              updated:       new Date().toISOString()
            });
          } catch {}
        }

        // Copy category type config
        try {
          let adminConfig;
          try {
            adminConfig = await metadataDB.get('finance:config:categories:Sanguinius');
          } catch {
            try {
              adminConfig = await metadataDB.get('config_category_types_Sanguinius');
            } catch {
              adminConfig = await metadataDB.get('config_category_types');
            }
          }

          const configId = `finance:config:categories:${userId}`;
          const seededConfig = {
            _id:                 configId,
            type:                'finance:config',
            user_id:             userId,
            income_categories:   [...(adminConfig.income_categories || adminConfig.positive_categories || [])],
            neutral_categories:  [...(adminConfig.neutral_categories  || [])],
            expense_categories:  [...(adminConfig.expense_categories  || [])]
          };

          try {
            const existingConfig = await metadataDB.get(configId);
            await metadataDB.put({
              ...existingConfig,
              income_categories:  [...new Set([...(existingConfig.income_categories || []), ...seededConfig.income_categories])],
              neutral_categories: [...new Set([...(existingConfig.neutral_categories || []), ...seededConfig.neutral_categories])],
              expense_categories: [...new Set([...(existingConfig.expense_categories || []), ...seededConfig.expense_categories])],
              updated:            new Date().toISOString()
            });
          } catch {
            await metadataDB.put(seededConfig);
          }

          console.log(`[SEED] Copied category config for ${userId}`);
        } catch {}

      } catch (err) {
        console.error("[SEED ERROR]", err);
      }
    };

    // ── Data refresh ──
    const refreshData = async () => {
      console.log("◈ [DATA] Starting refresh");
      try {
        await seedInitialCategoriesFromAdmin(username, dbMetadata);
        await CategorizationEngine.ensureObligationRules(dbMetadata, username);

        const now              = new Date();
        const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const [results, liveBalances, cardResults, accounts, cards, trends, arByTag, obligations] =
          await Promise.all([
            FinanceEngine.reconstructBalances(dbTransactions, dbMetadata, currentMonthPrefix, username),
            FinanceEngine.getBankAccountBalances(dbTransactions, dbMetadata, username),
            CardEngine.buildBuckets(dbTransactions, dbMetadata, username, null),
            AccountEngine.getAccounts(dbMetadata, username),
            AccountEngine.getCards(dbMetadata, username),
            AnalyticsEngine.getMonthlyTrends(dbTransactions, dbMetadata, username),
            FinanceEngine.getARByTag(dbTransactions, username),
            ObligationsEngine.getSummary(dbMetadata, dbTransactions, username),
          ]);

        // ── Genesis snapshot — marks the first reliable month ──
        // Anything before this was imported from the legacy system.
        let genesisMonth = null;
        try {
          const snaps = await dbMetadata.allDocs({
            include_docs: true,
            startkey: `finance:snapshot:${username}:`,
            endkey:   `finance:snapshot:${username}:￿`
          });
          const genesisDoc = snaps.rows
            .map(r => r.doc)
            .find(d => d?.type === 'finance:snapshot' && d?.is_genesis);
          genesisMonth = genesisDoc?.month || null;
        } catch (_) {}

        // ── Aggregate buckets across ALL cards (not just default) ──
        // cardResults from CardEngine.buildBuckets(..., null) only covers the
        // default card. For the Overview "BLOOD DEBT" KPI and the per-date
        // breakdown we need every card's buckets, merged by due_date.
        const allCardResults = await Promise.all(
          (cards || []).map(c =>
            CardEngine.buildBuckets(dbTransactions, dbMetadata, username, c._id)
          )
        );

        const todayIso = new Date().toISOString().substring(0, 10);
        const mergedByDate = new Map();
        allCardResults.forEach(r => {
          (r?.buckets || []).forEach(b => {
            if ((b.outstanding || 0) <= 0) return;
            const cur = mergedByDate.get(b.due_date) || {
              due_date: b.due_date, outstanding: 0, cards: []
            };
            cur.outstanding += b.outstanding;
            if (r.card?.name) cur.cards.push({ name: r.card.name, outstanding: b.outstanding });
            mergedByDate.set(b.due_date, cur);
          });
        });

        const allBuckets = Array.from(mergedByDate.values())
          .sort((a, b) => a.due_date.localeCompare(b.due_date))
          .map(b => ({ ...b, status: b.due_date < todayIso ? 'overdue' : 'outstanding' }));

        // Net card position: billed dues across all cards minus any
        // prepayment credit. Goes negative when cards are net prepaid,
        // so a credit balance (negative debt) propagates to every KPI
        // that reads data.totalDebt.
        const grossDebt     = allBuckets.reduce((s, b) => s + b.outstanding, 0);
        const totalCredit   = allCardResults.reduce((s, r) => s + (r?.creditBalance || 0), 0);
        const aggregateDebt = grossDebt - totalCredit;

        const cardObligationsCombined = {
          ...(cardResults || {}),
          allBuckets,
        };

        // ── Category config ──
        let expenseCategories  = [];
        let positiveCategories = [];
        let neutralCategories  = [];

        try {
          let config;
          try {
            config = await dbMetadata.get(`finance:config:categories:${username}`);
          } catch {
            try {
              config = await dbMetadata.get(`config_category_types_${username}`);
            } catch {
              config = await dbMetadata.get('config_category_types');
            }
          }

          positiveCategories = config.income_categories || config.positive_categories || [];
          neutralCategories  = config.neutral_categories  || [];

          const allMeta = await dbMetadata.allDocs({ include_docs: true });
          const allCategoryNames = allMeta.rows
            .map(r => r.doc)
            .filter(d =>
              (d.type === 'finance:rule' || d.type === 'category_rule') &&
              (d.user_id === username || !d.user_id) &&
              d.is_active !== false
            )
            .map(d => d.category_name);

          const hardExclude = new Set([
            'Opening Balance',
            'Account Closure',
            'Loan Drawdown',
            'Loan Payment',
            'EMI Payment'
          ]);

          expenseCategories = [...new Set(allCategoryNames)].filter(cat =>
            !hardExclude.has(cat) &&
            !positiveCategories.includes(cat) &&
            !neutralCategories.includes(cat)
          );

        } catch (err) {
          console.warn("◈ expenseCategories failed:", err);
        }

        if (results) {
          setFinanceData({
            ...results,
            liveBalances:       liveBalances || { accounts: [], total: 0 },
            cardObligations:    cardObligationsCombined,
            totalDebt:          aggregateDebt,
            accounts:           accounts || [],
            cards:              cards    || [],
            expenseCategories:  expenseCategories.sort(),
            positiveCategories,
            neutralCategories,
            trends:             trends || [],
            arByTag:            arByTag || {},
            genesisMonth,
            obligations:        obligations || {
              recurring: [], loans: [], emis: [],
              totalMonthlyLoad: 0, recurringMonthlyLoad: 0,
              emiMonthlyLoad: 0, loanMonthlyLoad: 0,
              recurringStats: { paid: 0, pending: 0, overdue: 0, total: 0 }
            }
          });
          setIsLoading(false);
          setError(null);
        }

      } catch (err) {
        console.error("◈ DATA PROCESSING ERROR:", err);
        setError(err);
      }
    };

    // ── Debounced refresh for sync events ──
    // Initial load runs immediately. Sync-triggered refreshes are
    // debounced to avoid cascading calls during bulk sync operations.
    let debounceTimer = null;
    const debouncedRefresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refreshData, 600);
    };

    syncTxns.on('change', debouncedRefresh);
    syncMeta.on('change', debouncedRefresh);

    // Local writes do not always emit replication changes while offline.
    // Listen to the local databases too so add/edit/delete actions are visible
    // immediately and then sync normally once the uplink returns.
    const localTxnChanges = dbTransactions
      .changes({ live: true, since: 'now' })
      .on('change', debouncedRefresh)
      .on('error', handleSyncError);
    const localMetaChanges = dbMetadata
      .changes({ live: true, since: 'now' })
      .on('change', debouncedRefresh)
      .on('error', handleSyncError);

    // Initial load — immediate, no debounce
    refreshData();

    return () => {
      clearTimeout(debounceTimer);
      clearInterval(probeIv);
      localTxnChanges.cancel();
      localMetaChanges.cancel();
      syncTxns.cancel();
      syncMeta.cancel();
      syncInv.cancel();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online',  handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };

  }, [credentials]);

  return { financeData, isLoading, error, syncLed, dbs };
};
