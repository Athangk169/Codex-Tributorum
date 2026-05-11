import { useState, useEffect } from "react";
import PouchDB from "pouchdb/dist/pouchdb";
import { 
  FinanceEngine, 
  CardEngine, 
  AccountEngine, 
  AnalyticsEngine 
} from "../utils/engine";

window.FinanceEngine = FinanceEngine;
window.CardEngine = CardEngine;

export const useFinanceData = (credentials) => {
  const [financeData, setFinanceData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncLed, setSyncLed] = useState('warn');
  const [dbs, setDbs] = useState({ txns: null, meta: null, inv: null });

  useEffect(() => {
    if (!credentials || !credentials.username || !credentials.password) {
      console.log("Ã¢â€”Ë† [HOOK] ABORTING: Missing credentials");
      return;
    }

    const { username, password } = credentials;

    // Initialize local PouchDB databases
    const dbTransactions = new PouchDB("finances");
    const dbMetadata = new PouchDB("metadata_vault");
    const dbInvestments = new PouchDB("investments_vault");

    setDbs({ txns: dbTransactions, meta: dbMetadata, inv: dbInvestments });
    window.PouchDB = PouchDB;

    // Setup remote sync
    const setupSync = (db, dbName) => {
      // Pull the dynamic host from local storage (or fallback to default)
      const savedHost = localStorage.getItem('COGITATOR_UPLINK_HOST') || '192.168.29.100:5984';
      
      // Auto-detect if it requires https (like Tailscale ts.net URLs)
      const protocol = 'http://';
      
      const remoteUrl = `${protocol}${savedHost}/${dbName}`;
      
      return db.sync(remoteUrl, {
        live: true,
        retry: true,
        auth: { username, password },
        ajax: {
          timeout: 30000,
          withCredentials: true,
          headers: {
            'Authorization': 'Basic ' + btoa(username + ':' + password)
          }
        }
      });
    };

    const syncTxns = setupSync(dbTransactions, "finances");
    const syncMeta = setupSync(dbMetadata, "metadata_vault");
    const syncInv = setupSync(dbInvestments, "investments_vault");

    const handleSyncActive  = () => {}; // don't set ok on mere retry attempt
    const handleSyncPaused  = (err) => err ? setSyncLed('warn') : setSyncLed('ok');
    const handleSyncChange  = () => setSyncLed('ok'); // only set ok on actual data sync
    const handleSyncError   = (err) => {
      console.error(`Ã¢â€”Ë† UPLINK FAILURE:`, err.message || err);
      setSyncLed('warn');
    };

    [syncTxns, syncMeta, syncInv].forEach(s => {
      s.on('active', handleSyncActive);
      s.on('paused', handleSyncPaused);
      s.on('change', handleSyncChange);
      s.on('error', handleSyncError);
      s.on('denied', handleSyncError);
    });

    // ==================== SEEDING FUNCTION ====================
    const seedInitialCategoriesFromAdmin = async (userId, metadataDB) => {
      if (!userId || userId === 'Sanguinius') return;

      try {
        const existingRules = await metadataDB.allDocs({ include_docs: true });
        const userRules = existingRules.rows.filter(r => 
          r.doc.type === 'category_rule' && r.doc.user_id === userId
        );

        if (userRules.length === 0) {
          console.log(`[SEED] First login detected for ${userId} Ã¢â‚¬â€ copying from admin...`);

          // Copy rules
          const adminRules = existingRules.rows.filter(r => 
            r.doc.type === 'category_rule' && r.doc.user_id === 'Sanguinius'
          );

          for (const rule of adminRules) {
            try {
              const newRule = { ...rule.doc };
              delete newRule._rev;
              newRule._id = `${rule.doc._id}__${userId}`;
              newRule.user_id = userId;
              await metadataDB.put(newRule);
            } catch (e) {}
          }

          // Copy category classification config
          try {
            let adminConfig;
            try {
              adminConfig = await metadataDB.get('config_category_types_Sanguinius');
            } catch {
              adminConfig = await metadataDB.get('config_category_types');
            }

            const newConfig = {
              _id: `config_category_types_${userId}`,
              type: 'system_config',
              user_id: userId,
              positive_categories: [...(adminConfig.positive_categories || [])],
              neutral_categories: [...(adminConfig.neutral_categories || [])],
              expense_categories: [...(adminConfig.expense_categories || [])]
            };

            await metadataDB.put(newConfig);
            console.log(`[SEED] Copied category classification for ${userId}`);
          } catch (e) {}
        }
      } catch (err) {
        console.error(`[SEED ERROR]`, err);
      }
    };

    // ==================== REFRESH DATA ====================
    const refreshData = async () => {
      console.log("Ã¢â€”Ë† [DATA] Starting refresh");
      try {
        // Seed categories for new users
        await seedInitialCategoriesFromAdmin(username, dbMetadata);

        const now = new Date();
        const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Get main finance data
        const results = await FinanceEngine.reconstructBalances(
          dbTransactions, dbMetadata, currentMonthPrefix, username
        );

        // After the existing reconstructBalances call, add:
        const liveBalances = await FinanceEngine.getBankAccountBalances(
          dbTransactions, dbMetadata, username
        );

        // Get credit card obligations
        const cardResults = await CardEngine.buildBuckets(
          dbTransactions, dbMetadata, username, null
        );

        const aggregateDebt = (cardResults?.buckets || []).reduce((acc, b) => acc + (b.outstanding || 0), 0);

        // Get accounts, cards, trends
        const accounts = await AccountEngine.getAccounts(dbMetadata, username);
        const cards = await AccountEngine.getCards(dbMetadata, username);
        const trends = await AnalyticsEngine.getMonthlyTrends(dbTransactions, dbMetadata, username);

        // ==================== EXPENSE CATEGORIES + CONFIG ====================
        let expenseCategories = [];
        let positiveCategories = [];
        let neutralCategories = [];

        try {
          // Get per-user config first
          let config;
          try {
            config = await dbMetadata.get(`config_category_types_${username}`);
          } catch {
            config = await dbMetadata.get('config_category_types');
          }

          positiveCategories = config.positive_categories || [];
          neutralCategories = config.neutral_categories || [];

          // Get all relevant category rules
          const allMeta = await dbMetadata.allDocs({ include_docs: true });
          const allCategoryNames = allMeta.rows
            .map(r => r.doc)
            .filter(d => d.type === 'category_rule' && (d.user_id === username || !d.user_id))
            .map(d => d.category_name);

          const uniqueNames = [...new Set(allCategoryNames)];

          // Hard exclusion for special categories
          const hardExclude = ['Opening Balance', 'Account Closure'];

          expenseCategories = uniqueNames.filter(cat =>
            !hardExclude.includes(cat) &&
            !positiveCategories.includes(cat) &&
            !neutralCategories.includes(cat)
          );

        } catch (err) {
          console.warn("Ã¢â€”Ë† expenseCategories failed:", err);
          expenseCategories = [];
          positiveCategories = [];
          neutralCategories = [];
        }

        if (results) {
          setFinanceData({
            ...results,
            liveBalances: liveBalances || { accounts: [], total: 0 },
            cardObligations: cardResults,
            totalDebt: aggregateDebt,
            accounts: accounts || [],
            cards: cards || [],
            expenseCategories: [...new Set(expenseCategories)].sort(),
            positiveCategories: positiveCategories,
            neutralCategories: neutralCategories,
            trends: trends || []
          });
          setIsLoading(false);
          setError(null);
        }
      } catch (err) {
        console.error("Ã¢â€”Ë† DATA PROCESSING ERROR:", err);
        setError(err);
      }
    };

    // ==================== SYNC + INITIAL LOAD ====================
    syncTxns.on('change', refreshData);
    syncMeta.on('change', refreshData);
    refreshData();

    return () => {
      syncTxns.cancel();
      syncMeta.cancel();
      syncInv.cancel();
    };
  }, [credentials]);

  return { financeData, isLoading, error, syncLed, dbs };
};