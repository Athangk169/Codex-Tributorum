import { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────
// useRulesAndCategories
// Shared data layer for the Recon / Holo screens (desktop + mobile).
// Owns the user's categorisation rules and the income/neutral/expense
// classification config, and exposes optimistic mutations.
//
// Optimism contract
//   Every mutation applies the predicted result to local state
//   first, then issues the PouchDB write. On success the response
//   _rev is patched back into local state. On failure the previous
//   state is restored and `reload()` runs to recover from any
//   server-side drift; the error is then re-thrown so the caller
//   can flash a status message.
//
//   Cost of optimism: a 409 conflict will visually flicker (apply →
//   revert → reload). Acceptable for personal-scale CRUD; gone the
//   second you reload.
// ─────────────────────────────────────────────────────────────

const EMPTY_CONFIG = {
  income_categories: [],
  neutral_categories: [],
  expense_categories: [],
};

function configIdFor(userId) {
  return `finance:config:categories:${userId}`;
}

function defaultConfigFor(userId) {
  return {
    _id: configIdFor(userId),
    type: 'finance:config',
    user_id: userId,
    ...EMPTY_CONFIG,
  };
}

function sortRules(list) {
  return [...list].sort((a, b) => a.category_name.localeCompare(b.category_name));
}

export function useRulesAndCategories(db, userId) {
  const [rules, setRules]       = useState([]);
  const [config, setConfig]     = useState(EMPTY_CONFIG);
  const [isLoading, setLoading] = useState(false);
  const reloadingRef            = useRef(false);

  const reload = useCallback(async () => {
    if (!db || !userId) return;
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    setLoading(true);
    try {
      const allDocs = await db.allDocs({
        include_docs: true,
        startkey: `finance:rule:${userId}:`,
        endkey:   `finance:rule:${userId}:￿`,
      });
      const unique = {};
      allDocs.rows
        .map(r => r.doc)
        .filter(d => d?.type === 'finance:rule' && d.user_id === userId && d.is_active)
        .forEach(rule => { unique[rule.category_name] = rule; });
      setRules(sortRules(Object.values(unique)));

      let cfg;
      try { cfg = await db.get(configIdFor(userId)); }
      catch { cfg = defaultConfigFor(userId); }
      setConfig(cfg);
    } finally {
      reloadingRef.current = false;
      setLoading(false);
    }
  }, [db, userId]);

  useEffect(() => { reload(); }, [reload]);

  const getCatType = useCallback((name) => {
    if (config.income_categories?.includes(name))  return 'income';
    if (config.neutral_categories?.includes(name)) return 'neutral';
    return 'expense';
  }, [config]);

  // ── Internal helper: roll back + sync ────────────────────────
  const revert = useCallback((prevRules, prevConfig) => {
    if (prevRules != null)  setRules(prevRules);
    if (prevConfig != null) setConfig(prevConfig);
    reload();
  }, [reload]);

  // ── Keyword mutations ────────────────────────────────────────
  const addKeyword = useCallback(async (ruleId, rawKw) => {
    const kw = (rawKw || '').trim().toLowerCase();
    if (!kw) throw new Error('KEYWORD EMPTY');
    const rule = rules.find(r => r._id === ruleId);
    if (!rule) throw new Error('RULE NOT FOUND');
    if (rule.keywords.includes(kw)) throw new Error('KEYWORD ALREADY EXISTS');

    const prevRules = rules;
    const optimistic = { ...rule, keywords: [...rule.keywords, kw], updated: new Date().toISOString() };
    setRules(rs => rs.map(r => r._id === ruleId ? optimistic : r));
    try {
      const res = await db.put(optimistic);
      setRules(rs => rs.map(r => r._id === ruleId ? { ...optimistic, _rev: res.rev } : r));
    } catch (e) {
      revert(prevRules, null);
      throw e;
    }
  }, [db, rules, revert]);

  const deleteKeyword = useCallback(async (ruleId, kw) => {
    const rule = rules.find(r => r._id === ruleId);
    if (!rule) throw new Error('RULE NOT FOUND');

    const prevRules = rules;
    const optimistic = { ...rule, keywords: rule.keywords.filter(k => k !== kw), updated: new Date().toISOString() };
    setRules(rs => rs.map(r => r._id === ruleId ? optimistic : r));
    try {
      const res = await db.put(optimistic);
      setRules(rs => rs.map(r => r._id === ruleId ? { ...optimistic, _rev: res.rev } : r));
    } catch (e) {
      revert(prevRules, null);
      throw e;
    }
  }, [db, rules, revert]);

  // ── Category type (config) mutation ──────────────────────────
  const updateType = useCallback(async (categoryName, newType) => {
    const prevConfig = config;
    const cleared = {
      ...prevConfig,
      income_categories:  (prevConfig.income_categories  || []).filter(c => c !== categoryName),
      neutral_categories: (prevConfig.neutral_categories || []).filter(c => c !== categoryName),
      expense_categories: (prevConfig.expense_categories || []).filter(c => c !== categoryName),
    };
    if (newType === 'income')       cleared.income_categories  = [...cleared.income_categories,  categoryName];
    else if (newType === 'neutral') cleared.neutral_categories = [...cleared.neutral_categories, categoryName];
    else                            cleared.expense_categories = [...cleared.expense_categories, categoryName];

    setConfig(cleared);
    try {
      const res = await db.put(cleared);
      setConfig({ ...cleared, _rev: res.rev });
    } catch (e) {
      revert(null, prevConfig);
      throw e;
    }
  }, [db, config, revert]);

  // ── Category lifecycle ───────────────────────────────────────
  const addCategory = useCallback(async (rawName, type) => {
    const name = (rawName || '').trim();
    if (!name)   throw new Error('NAME EMPTY');
    if (!userId) throw new Error('NO USER');

    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const id   = `finance:rule:${userId}:${slug}`;
    if (rules.some(r => r._id === id || r.category_name.toLowerCase() === name.toLowerCase())) {
      throw new Error('CATEGORY ALREADY EXISTS');
    }
    const now = new Date().toISOString();
    const newRule = {
      _id: id, type: 'finance:rule', user_id: userId,
      category_name: name, keywords: [], is_active: true,
      created: now, updated: now,
    };

    const prevRules  = rules;
    const prevConfig = config;
    setRules(rs => sortRules([...rs, newRule]));

    const baseConfig = config?._id ? config : defaultConfigFor(userId);
    const updatedConfig = {
      ...baseConfig,
      income_categories:  [...(baseConfig.income_categories  || [])],
      neutral_categories: [...(baseConfig.neutral_categories || [])],
      expense_categories: [...(baseConfig.expense_categories || [])],
    };
    if (type === 'income')       updatedConfig.income_categories.push(name);
    else if (type === 'neutral') updatedConfig.neutral_categories.push(name);
    else                         updatedConfig.expense_categories.push(name);
    setConfig(updatedConfig);

    try {
      const r1 = await db.put(newRule);
      const r2 = await db.put(updatedConfig);
      setRules(rs => rs.map(r => r._id === id ? { ...newRule, _rev: r1.rev } : r));
      setConfig({ ...updatedConfig, _rev: r2.rev });
      return id;
    } catch (e) {
      revert(prevRules, prevConfig);
      throw e;
    }
  }, [db, userId, rules, config, revert]);

  const deleteCategory = useCallback(async (rule) => {
    const prevRules  = rules;
    const prevConfig = config;
    setRules(rs => rs.filter(r => r._id !== rule._id));
    const updatedConfig = {
      ...config,
      income_categories:  (config.income_categories  || []).filter(c => c !== rule.category_name),
      neutral_categories: (config.neutral_categories || []).filter(c => c !== rule.category_name),
      expense_categories: (config.expense_categories || []).filter(c => c !== rule.category_name),
    };
    setConfig(updatedConfig);

    try {
      await db.remove(rule);
      if (updatedConfig._id) {
        const res = await db.put(updatedConfig);
        setConfig({ ...updatedConfig, _rev: res.rev });
      }
    } catch (e) {
      revert(prevRules, prevConfig);
      throw e;
    }
  }, [db, rules, config, revert]);

  const renameCategory = useCallback(async (ruleId, newName) => {
    const cleanName = (newName || '').trim();
    if (!cleanName) throw new Error('NAME EMPTY');
    const rule = rules.find(r => r._id === ruleId);
    if (!rule) throw new Error('RULE NOT FOUND');
    const oldName = rule.category_name;
    if (oldName === cleanName) return;

    const prevRules  = rules;
    const prevConfig = config;
    const updatedRule = { ...rule, category_name: cleanName, updated: new Date().toISOString() };
    setRules(rs => sortRules(rs.map(r => r._id === ruleId ? updatedRule : r)));

    const updatedConfig = {
      ...config,
      income_categories:  (config.income_categories  || []).map(c => c === oldName ? cleanName : c),
      neutral_categories: (config.neutral_categories || []).map(c => c === oldName ? cleanName : c),
      expense_categories: (config.expense_categories || []).map(c => c === oldName ? cleanName : c),
    };
    setConfig(updatedConfig);

    try {
      const r1 = await db.put(updatedRule);
      const r2 = await db.put(updatedConfig);
      setRules(rs => rs.map(r => r._id === ruleId ? { ...updatedRule, _rev: r1.rev } : r));
      setConfig({ ...updatedConfig, _rev: r2.rev });
    } catch (e) {
      revert(prevRules, prevConfig);
      throw e;
    }
  }, [db, rules, config, revert]);

  return {
    rules, config, isLoading,
    getCatType,
    addCategory, deleteCategory, renameCategory, updateType,
    addKeyword, deleteKeyword,
    reload,
  };
}
