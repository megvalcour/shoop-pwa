import { describe, it, expect, beforeEach } from 'vitest';
import { useCategorizationStore } from '@/stores/useCategorizationStore';

const get = () => useCategorizationStore.getState();

describe('useCategorizationStore', () => {
  beforeEach(() => {
    useCategorizationStore.setState({ status: 'idle', categorizingIds: new Set() });
  });

  it('setStatus updates status and is idempotent (same reference on no-op)', () => {
    get().setStatus('loading');
    expect(get().status).toBe('loading');

    const before = get();
    get().setStatus('loading');
    expect(get()).toBe(before); // no state object replacement on a no-op set
  });

  it('begin adds an id with a fresh Set reference; a duplicate begin is a no-op', () => {
    const initial = get().categorizingIds;
    get().begin('a');
    const afterAdd = get().categorizingIds;

    expect(afterAdd).not.toBe(initial);
    expect(afterAdd.has('a')).toBe(true);

    get().begin('a');
    expect(get().categorizingIds).toBe(afterAdd); // unchanged reference
  });

  it('end removes an id with a fresh Set reference; ending an absent id is a no-op', () => {
    get().begin('a');
    const afterAdd = get().categorizingIds;

    get().end('a');
    const afterRemove = get().categorizingIds;
    expect(afterRemove).not.toBe(afterAdd);
    expect(afterRemove.has('a')).toBe(false);

    get().end('a');
    expect(get().categorizingIds).toBe(afterRemove); // unchanged reference
  });

  it('reset clears all ids with a fresh Set reference; resetting an empty set is a no-op', () => {
    get().begin('a');
    get().begin('b');
    const before = get().categorizingIds;

    get().reset();
    expect(get().categorizingIds).not.toBe(before);
    expect(get().categorizingIds.size).toBe(0);

    const empty = get().categorizingIds;
    get().reset();
    expect(get().categorizingIds).toBe(empty); // unchanged reference
  });
});
