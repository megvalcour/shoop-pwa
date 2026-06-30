import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbPromise, EAT_PROFILE_KEY } from '@/db/idbClient';
import type { EatProfile } from '@/db/schema';

export const EAT_PROFILE_QUERY_KEY = ['preferences', EAT_PROFILE_KEY] as const;

/**
 * The single user's Eat profile, read from the `preferences` store and parsed
 * from its JSON blob (Phase 2). Returns `null` when no profile has been written
 * yet — and ALSO when the stored blob is unparseable: a corrupt/legacy value
 * must surface the empty state, never crash the Eat tab. The data is purely
 * local, so this is offline-safe by construction.
 */
export function useEatProfile() {
  return useQuery({
    queryKey: EAT_PROFILE_QUERY_KEY,
    queryFn: async (): Promise<EatProfile | null> => {
      const db = await dbPromise;
      const pref = await db.get('preferences', EAT_PROFILE_KEY);
      if (!pref?.value) return null;
      try {
        return JSON.parse(pref.value) as EatProfile;
      } catch {
        return null;
      }
    },
  });
}

/**
 * Persist the user's Eat profile as a JSON value under `EAT_PROFILE_KEY`, then
 * invalidate the query so the computed targets recompute live (no stale numbers).
 * Local-only write, so it's already offline-safe — no network in the path.
 */
export function useSetEatProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: EatProfile) => {
      const db = await dbPromise;
      await db.put('preferences', { key: EAT_PROFILE_KEY, value: JSON.stringify(profile) });
      return profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EAT_PROFILE_QUERY_KEY });
    },
  });
}
