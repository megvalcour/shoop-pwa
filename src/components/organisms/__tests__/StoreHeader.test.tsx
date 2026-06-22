import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StoreHeader from '@/components/organisms/StoreHeader';
import type { Store } from '@/db/schema';

const STORE: Store = {
  id: 's1',
  name: 'Market Basket',
  address: '62 Oxford',
  slug: 'oxford-62',
};

vi.mock('@/hooks/useStores', () => ({
  useActiveStore: () => ({ data: STORE }),
  useStores: () => ({ data: [STORE] }),
}));

vi.mock('@/hooks/usePreferences', () => ({
  useSetActiveStoreId: () => ({ mutate: vi.fn() }),
}));

describe('StoreHeader', () => {
  it('opens the store switcher sheet when the logo button is clicked', () => {
    render(<StoreHeader />);
    expect(screen.queryByText('Switch store')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /switch store/i }));
    expect(screen.getByText('Switch store')).toBeInTheDocument();
    // No "Coming soon" placeholder — every store is a real switch target now.
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });
});
