// Per-store matcher alias files, keyed by store slug (ADR-0011 anticipated
// per-store aliases; ADR-0015 wires them to the active store). These are
// matcher-only data — concrete query terms mapped to a store's aisle `number`.

import oxfordAliases from '@/assets/aisles/oxford-62-aliases.json';
import bigYAliases from '@/assets/aisles/big-y-worcester-aliases.json';
import type { AliasMap } from '@/services/classifier';

const ALIASES_BY_SLUG: Record<string, AliasMap> = {
  'oxford-62': oxfordAliases as AliasMap,
  'big-y-worcester': bigYAliases as AliasMap,
};

/** Alias map for a store slug, or an empty map for an unknown/absent slug. */
export function aliasesForSlug(slug: string | undefined): AliasMap {
  return (slug && ALIASES_BY_SLUG[slug]) || {};
}
