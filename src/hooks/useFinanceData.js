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
  const [syncLed, setSyncLed]         = useState('warn');
  const [dbs, setDbs]                 = useState({ txns: null, meta: null, inv: null });

  useEffect(() => {
    if (!credentials?.username || !credentials?.password) {
      console.log("◈ [HOOK] ABORTING: Missing credentials");
      return;
    }

    const { username, password } = credentials;

    // ── Local PouchDB instances ──
    const dbTransactions = new PouchDB("finances");
    const dbMetadata     = new PouchDB("metadata_vault");
    const dbInvestments  = new PouchDB("investments_vault");

    setDbs({ txns: dbTransactions, meta: dbMetadata, inv: dbInvestments });

    // ── Remote sync setup ──
    const setupSync = (db, dbName) => {
      const savedHost = localStorage.getItem('COGITATOR_UPLINK_HOST') || '192.168.29.100:5984';

      // Use https for Tailscale ts.net hostnames, http for local IPs
      const protocol = savedHost.includes('ts.net') ? 'https://' : 'http://';
      const remoteUrl = `${protocol}${savedHost}/${dbName}`;

      return db.sync(remoteUrl, {
        live:  true,
        retry: true,
        auth:  { username, password },
        ajax:  {
          timeout:         30000,
          withCredentials: true,
          headers: {
            'Authorization': 'Basic ' + btoa(username + ':' + password)
          }
        }
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

        const aggregateDebt = (cardResults?.buckets || [])
          .reduce((acc, b) => acc + (b.outstanding || 0), 0);

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
            cardObligations:    cardResults,
            totalDebt:          aggregateDebt,
            accounts:           accounts || [],
            cards:              cards    || [],
            expenseCategories:  expenseCategories.sort(),
            positiveCategories,
            neutralCategories,
            trends:             trends || [],
            arByTag:            arByTag || {},
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
      localTxnChanges.cancel();
      localMetaChanges.cancel();
      syncTxns.cancel();
      syncMeta.cancel();
      syncInv.cancel();
    };

  }, [credentials]);

  return { financeData, isLoading, error, syncLed, dbs };
};
