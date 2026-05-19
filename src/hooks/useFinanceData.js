import { useState, useEffect } from "react";
import PouchDB from "pouchdb/dist/pouchdb";
import {
  FinanceEngine,
  CardEngine,
  AccountEngine,
  AnalyticsEngine
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
    const seedInitialCategoriesFromAdmin = async (userId, metadataDB) => {
      if (!userId || userId === 'Sanguinius') return;

      try {
        const existingRules = await metadataDB.allDocs({ include_docs: true });
        const userRules = existingRules.rows.filter(r =>
          r.doc.type === 'category_rule' && r.doc.user_id === userId
        );

        if (userRules.length > 0) return; // already seeded

        console.log(`[SEED] First login for ${userId} — copying from Sanguinius`);

        // Copy category rules
        const adminRules = existingRules.rows.filter(r =>
          r.doc.type === 'category_rule' && r.doc.user_id === 'Sanguinius'
        );

        for (const rule of adminRules) {
          try {
            const newRule  = { ...rule.doc };
            delete newRule._rev;
            newRule._id     = `${rule.doc._id}__${userId}`;
            newRule.user_id = userId;
            await metadataDB.put(newRule);
          } catch (_) {}
        }

        // Copy category type config
        try {
          let adminConfig;
          try {
            adminConfig = await metadataDB.get('config_category_types_Sanguinius');
          } catch {
            adminConfig = await metadataDB.get('config_category_types');
          }

          await metadataDB.put({
            _id:                 `config_category_types_${userId}`,
            type:                'system_config',
            user_id:             userId,
            positive_categories: [...(adminConfig.positive_categories || [])],
            neutral_categories:  [...(adminConfig.neutral_categories  || [])],
            expense_categories:  [...(adminConfig.expense_categories  || [])]
          });

          console.log(`[SEED] Copied category config for ${userId}`);
        } catch (_) {}

      } catch (err) {
        console.error("[SEED ERROR]", err);
      }
    };

    // ── Data refresh ──
    const refreshData = async () => {
      console.log("◈ [DATA] Starting refresh");
      try {
        await seedInitialCategoriesFromAdmin(username, dbMetadata);

        const now              = new Date();
        const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const [results, liveBalances, cardResults, accounts, cards, trends, arByTag] =
          await Promise.all([
            FinanceEngine.reconstructBalances(dbTransactions, dbMetadata, currentMonthPrefix, username),
            FinanceEngine.getBankAccountBalances(dbTransactions, dbMetadata, username),
            CardEngine.buildBuckets(dbTransactions, dbMetadata, username, null),
            AccountEngine.getAccounts(dbMetadata, username),
            AccountEngine.getCards(dbMetadata, username),
            AnalyticsEngine.getMonthlyTrends(dbTransactions, dbMetadata, username),
            FinanceEngine.getARByTag(dbTransactions, username),
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
            config = await dbMetadata.get(`config_category_types_${username}`);
          } catch {
            config = await dbMetadata.get('config_category_types');
          }

          positiveCategories = config.positive_categories || [];
          neutralCategories  = config.neutral_categories  || [];

          const allMeta = await dbMetadata.allDocs({ include_docs: true });
          const allCategoryNames = allMeta.rows
            .map(r => r.doc)
            .filter(d => d.type === 'category_rule' && (d.user_id === username || !d.user_id))
            .map(d => d.category_name);

          const hardExclude = new Set(['Opening Balance', 'Account Closure']);

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
            arByTag:            arByTag || {}
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

    // Initial load — immediate, no debounce
    refreshData();

    return () => {
      clearTimeout(debounceTimer);
      syncTxns.cancel();
      syncMeta.cancel();
      syncInv.cancel();
    };

  }, [credentials]);

  return { financeData, isLoading, error, syncLed, dbs };
};