import { describe, it, expect } from 'vitest';
import catalogData from '@/assets/aisles/oxford-62.json';
import aliasData from '@/assets/aisles/oxford-62-aliases.json';
import {
  normalize,
  buildCandidates,
  lexicalMatch,
  aggregateTopK,
  type AliasMap,
  type Candidate,
} from '@/services/classifier';
import { AISLE_CASES } from '@/services/__tests__/fixtures/aisle-cases';

const { aisles, items } = catalogData as {
  aisles: { id: string; number: string }[];
  items: { canonical_name: string; aisle_id: string }[];
};
const aisleById = new Map(aisles.map((a) => [a.id, a.number]));
const candidates = buildCandidates(items, aliasData as AliasMap, aisleById);

describe('normalize', () => {
  it('lowercases, splits, and drops stopwords', () => {
    expect(normalize('Peanuts in Shell')).toEqual(['peanuts', 'shell']);
  });

  it('reverses "category: qualifier" into a natural phrase', () => {
    expect(normalize('fruit: fresh')).toEqual(['fresh', 'fruit']);
  });

  it('splits on - / & after the colon', () => {
    expect(normalize('sauce: bbq-chili-steak')).toEqual(['bbq', 'chili', 'steak', 'sauce']);
  });

  it('returns an empty array for punctuation-only input', () => {
    expect(normalize('   ::  ')).toEqual([]);
  });
});

describe('buildCandidates', () => {
  it('includes both catalog items and alias terms', () => {
    const produce = candidates.filter((c) => c.aisleNumber === 'Produce Dept');
    // Catalog produce items (e.g. fresh fruit) plus authored aliases (banana…).
    expect(produce.some((c) => c.phrase === 'fresh fruit')).toBe(true);
    expect(produce.some((c) => c.phrase === 'banana')).toBe(true);
  });

  it('skips items whose aisle id is unknown', () => {
    const result = buildCandidates(
      [{ canonical_name: 'mystery', aisle_id: 'does-not-exist' }],
      {},
      new Map(),
    );
    expect(result).toEqual([]);
  });
});

describe('lexicalMatch', () => {
  it.each(AISLE_CASES)('classifies "$query" → $expected ($label)', ({ query, expected }) => {
    const result = lexicalMatch(query, candidates);
    expect(result?.aisleNumber).toBe(expected);
    expect(result?.confident).toBe(true);
  });

  it('returns null when nothing matches', () => {
    expect(lexicalMatch('zzzz', candidates)).toBeNull();
  });

  it('returns null when equally-specific candidates point at different aisles', () => {
    const ambiguous: Candidate[] = [
      { phrase: 'thing', tokens: ['thing'], aisleNumber: '1' },
      { phrase: 'thing', tokens: ['thing'], aisleNumber: '2' },
    ];
    // Exact phrase resolves to the first; force the containment path instead.
    expect(lexicalMatch('a thing here', ambiguous)).toBeNull();
  });
});

describe('aggregateTopK', () => {
  it('returns null for no scores', () => {
    expect(aggregateTopK([], 5)).toBeNull();
  });

  it('votes by summed top-k score, reporting the winner best neighbour', () => {
    const scored = [
      { aisleNumber: 'A', score: 0.9 },
      { aisleNumber: 'B', score: 0.6 },
      { aisleNumber: 'B', score: 0.55 },
      { aisleNumber: 'B', score: 0.52 },
    ];
    // A: sum 0.9. B: sum 1.67 → B wins; reported score is B's best (0.6).
    const result = aggregateTopK(scored, 5);
    expect(result).toEqual({ aisleNumber: 'B', score: 0.6 });
  });

  it('only considers the top k neighbours', () => {
    const scored = [
      { aisleNumber: 'A', score: 0.95 },
      { aisleNumber: 'B', score: 0.4 },
      { aisleNumber: 'B', score: 0.3 },
    ];
    // With k=1 only A's neighbour survives.
    expect(aggregateTopK(scored, 1)).toEqual({ aisleNumber: 'A', score: 0.95 });
  });
});
