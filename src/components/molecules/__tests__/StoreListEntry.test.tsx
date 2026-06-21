import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import StoreListEntry from '@/components/molecules/StoreListEntry';
import type { Store } from '@/db/schema';

const store: Store = {
  id: 'store-1',
  name: 'Oxford Market Basket #62',
  address: '105 Main St, Oxford MA',
  slug: 'oxford-62',
};

describe('StoreListEntry', () => {
  it('renders the store name and address', () => {
    render(<StoreListEntry store={store} onClick={() => {}} />);
    expect(screen.getByText('Oxford Market Basket #62')).toBeInTheDocument();
    expect(screen.getByText('105 Main St, Oxford MA')).toBeInTheDocument();
  });

  it('calls onClick when the row is clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<StoreListEntry store={store} onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Oxford Market Basket #62' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the store logo image', () => {
    render(<StoreListEntry store={store} onClick={() => {}} />);
    expect(screen.getByRole('img', { name: 'Oxford Market Basket #62' })).toBeInTheDocument();
  });
});
