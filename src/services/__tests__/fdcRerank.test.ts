import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  rankBySimilarity,
  selectBestCandidate,
  RERANK_CONFIDENCE_FLOOR,
} from '@/services/fdcRerank';

describe('cosineSimilarity', () => {
  it('is 1 for identical directions and 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('is 0 against a zero vector (no NaN)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('rankBySimilarity', () => {
  it('orders candidates by similarity to the query, highest first', () => {
    const query = [1, 0, 0];
    const ranked = rankBySimilarity(query, [
      { fdcId: 'far', description: 'far', embedding: [0, 1, 0] },
      { fdcId: 'near', description: 'near', embedding: [0.9, 0.1, 0] },
      { fdcId: 'mid', description: 'mid', embedding: [0.5, 0.5, 0] },
    ]);
    expect(ranked.map((r) => r.fdcId)).toEqual(['near', 'mid', 'far']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});

describe('selectBestCandidate', () => {
  it('marks the top pick confident when it clears the floor', () => {
    const result = selectBestCandidate([
      { fdcId: 'a', description: 'a', score: RERANK_CONFIDENCE_FLOOR + 0.1 },
      { fdcId: 'b', description: 'b', score: 0.1 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.candidate.fdcId).toBe('a');
    expect(result!.confident).toBe(true);
  });

  it('returns the top pick but not-confident when below the floor', () => {
    const result = selectBestCandidate([{ fdcId: 'a', description: 'a', score: 0.2 }]);
    expect(result!.candidate.fdcId).toBe('a');
    expect(result!.confident).toBe(false);
  });

  it('returns null for an empty candidate list', () => {
    expect(selectBestCandidate([])).toBeNull();
  });
});
