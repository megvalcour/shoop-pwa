import { describe, it, expect } from 'vitest';
import { aliasesForSlug } from '@/services/aisleAliases';

describe('aislesForSlug', () => {
  it('returns the alias map for each registered store slug', () => {
    expect(Object.keys(aliasesForSlug('oxford-62')).length).toBeGreaterThan(0);
    expect(Object.keys(aliasesForSlug('big-y-worcester')).length).toBeGreaterThan(0);
    expect(Object.keys(aliasesForSlug('general')).length).toBeGreaterThan(0);
  });

  it('keys the General Store aliases by section label and maps common terms', () => {
    const general = aliasesForSlug('general');
    expect(general['Dairy & Eggs']).toContain('milk');
    expect(general['Produce']).toContain('banana');
    expect(general['Beverages']).toContain('coffee');
  });

  it('returns an empty map for an unknown or absent slug', () => {
    expect(aliasesForSlug('does-not-exist')).toEqual({});
    expect(aliasesForSlug(undefined)).toEqual({});
  });
});
