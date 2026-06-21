import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StoreSwitcherSheet from '@/components/molecules/StoreSwitcherSheet';
import type { Store } from '@/db/schema';

const STORES: Store[] = [
  { id: 's1', name: 'Market Basket', address: '62 Oxford', slug: 'oxford-62' },
];

describe('StoreSwitcherSheet', () => {
  it('renders the active store row with a check', () => {
    render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onClose={vi.fn()} />,
    );
    const row = screen.getByText('Market Basket').closest('button') as HTMLElement;
    expect(row).toBeInTheDocument();
    // check icon (data-icon="check") is present on the selected row
    expect(row.querySelector('[data-icon="check"]')).not.toBeNull();
  });

  it('renders a disabled Big Y row with a "Coming soon" badge', () => {
    render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onClose={vi.fn()} />,
    );
    expect(screen.getByText('Big Y')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    // Big Y is not an interactive switch target
    expect(screen.getByText('Big Y').closest('button')).toBeNull();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onClose={onClose} />,
    );
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /close store switcher/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the active store row is clicked (UI only)', () => {
    const onClose = vi.fn();
    render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onClose={onClose} />,
    );
    fireEvent.click(screen.getByText('Market Basket'));
    expect(onClose).toHaveBeenCalled();
  });
});
