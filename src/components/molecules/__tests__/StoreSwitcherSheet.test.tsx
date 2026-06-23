import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StoreSwitcherSheet from '@/components/molecules/StoreSwitcherSheet';
import type { Store } from '@/db/schema';

const STORES: Store[] = [
  { id: 's1', name: 'Market Basket', address: '62 Oxford', slug: 'oxford-62' },
  { id: 's2', name: 'Big Y', address: '100 Mayfield St', slug: 'big-y-worcester' },
];

describe('StoreSwitcherSheet', () => {
  it('renders the active store row with a check', () => {
    render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    const row = screen.getByText('Market Basket').closest('button') as HTMLElement;
    expect(row).toBeInTheDocument();
    // check icon (data-icon="check") is present on the selected row
    expect(row.querySelector('[data-icon="check"]')).not.toBeNull();
  });

  it('renders every store as a switch target with no "Coming soon" placeholder', () => {
    render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByText('Coming soon')).toBeNull();
    expect(screen.getByText('Big Y').closest('button')).not.toBeNull();
  });

  it('selecting a different store calls onSelect then onClose', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onSelect={onSelect} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText('Big Y'));
    expect(onSelect).toHaveBeenCalledWith('s2');
    expect(onClose).toHaveBeenCalled();
  });

  it('selecting the already-active store closes without calling onSelect', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onSelect={onSelect} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText('Market Basket'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onSelect={vi.fn()} onClose={onClose} />,
    );
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onSelect={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <StoreSwitcherSheet stores={STORES} currentStoreId="s1" onSelect={vi.fn()} onClose={onClose} />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
