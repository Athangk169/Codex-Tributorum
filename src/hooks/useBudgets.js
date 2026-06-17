import { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────
// useBudgets
// Per-category monthly spending caps ("quotas"). One doc per
// category in metadata_vault, mirroring the finance:rule scheme.
//
//   finance:budget:${userId}:${categorySlug}
//     { type, user_id, category_name, monthly_cap, created, updated }
//
// Actuals are never stored here — they're derived from the
// month's byCategory trend at the call site. This hook only owns
// the targets.
//
// Same optimistic contract as useRulesAndCategories: apply the
// predicted result locally, issue the PouchDB write, patch _rev
// back on success, restore + reload on failure.
// ─────────────────────────────────────────────────────────────

const slugify = (name) =>
  String(name || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

export function useBudgets(db, userId) {
  const [budgets, setBudgets]   = useState({}); // { [category_name]: doc }
  const [isLoading, setLoading] = useState(false);
  const reloadingRef            = useRef(false);

  const reload = useCallback(async () => {
    if (!db || !userId) return;
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    setLoading(true);
    try {
      const res = await db.allDocs({
        include_docs: true,
        startkey: `finance:budget:${userId}:`,
        endkey:   `finance:budget:${userId}:￿`,
      });
      const map = {};
      res.rows
        .map(r => r.doc)
        .filter(d => d?.type === 'finance:budget' && d.user_id === userId)
        .forEach(d => { map[d.category_name] = d; });
      setBudgets(map);
    } finally {
      reloadingRef.current = false;
      setLoading(false);
    }
  }, [db, userId]);

  useEffect(() => { reload(); }, [reload]);

  // Create or update a category's monthly cap.
  const setBudget = useCallback(async (categoryName, cap) => {
    const name = (categoryName || '').trim();
    if (!name)   throw new Error('CATEGORY EMPTY');
    if (!userId) throw new Error('NO USER');
    const amount = Number(cap);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('INVALID CAP');

    const existing = budgets[name];
    const now = new Date().toISOString();
    const doc = existing
      ? { ...existing, monthly_cap: amount, updated: now }
      : {
          _id:           `finance:budget:${userId}:${slugify(name)}`,
          type:          'finance:budget',
          user_id:       userId,
          category_name: name,
          monthly_cap:   amount,
          created:       now,
          updated:       now,
        };

    const prev = budgets;
    setBudgets(b => ({ ...b, [name]: doc }));
    try {
      const r = await db.put(doc);
      setBudgets(b => ({ ...b, [name]: { ...doc, _rev: r.rev } }));
    } catch (e) {
      setBudgets(prev);
      reload();
      throw e;
    }
  }, [db, userId, budgets, reload]);

  // Remove a category's cap entirely.
  const removeBudget = useCallback(async (categoryName) => {
    const existing = budgets[categoryName];
    if (!existing?._rev) return;

    const prev = budgets;
    setBudgets(b => { const n = { ...b }; delete n[categoryName]; return n; });
    try {
      await db.remove(existing);
    } catch (e) {
      setBudgets(prev);
      reload();
      throw e;
    }
  }, [db, budgets, reload]);

  return { budgets, isLoading, setBudget, removeBudget, reload };
}
