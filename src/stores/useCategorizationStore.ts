import { create } from 'zustand';
import type { MatcherStatus } from '@/hooks/useAisleMatcher';

export type { MatcherStatus };

/**
 * Ephemeral, session-only categorization state (ADR-0004). It bridges the
 * matcher lifecycle owned by `useItemClassification` to the sibling
 * `ShoppingListBuilder` organism so the list can tell an item that is *actively
 * being categorized* (spinner) apart from one that is *settled-uncategorized*
 * (tappable Categorize badge).
 *
 * This is the project's first Zustand slice: it never writes to IndexedDB and
 * never imports from `hooks/`. A reload starts `idle`/empty — correct, since
 * nothing is in flight after a reload.
 */
interface CategorizationState {
  /** Mirror of the active store's matcher lifecycle, published by
   *  useItemClassification. */
  status: MatcherStatus;
  /** Item ids with a classification queued or in flight for the active store. */
  categorizingIds: Set<string>;
  setStatus: (status: MatcherStatus) => void;
  begin: (itemId: string) => void;
  end: (itemId: string) => void;
  /** Clear all in-flight ids (used on active-store switch / unmount). */
  reset: () => void;
}

export const useCategorizationStore = create<CategorizationState>((set) => ({
  status: 'idle',
  categorizingIds: new Set(),
  setStatus: (status) => set((s) => (s.status === status ? s : { status })),
  begin: (itemId) =>
    set((s) => {
      if (s.categorizingIds.has(itemId)) return s;
      const next = new Set(s.categorizingIds);
      next.add(itemId);
      return { categorizingIds: next };
    }),
  end: (itemId) =>
    set((s) => {
      if (!s.categorizingIds.has(itemId)) return s;
      const next = new Set(s.categorizingIds);
      next.delete(itemId);
      return { categorizingIds: next };
    }),
  reset: () =>
    set((s) => (s.categorizingIds.size === 0 ? s : { categorizingIds: new Set() })),
}));
