import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { DefaultListEntry } from '@/db/schema';

vi.mock('@/hooks/useCreateAndNavigateToList', () => ({
  useCreateAndNavigateToList: vi.fn(),
}));
vi.mock('@/hooks/useDefaultList', () => ({ useDefaultList: vi.fn() }));

const mockCreateAndNavigate = vi.fn().mockResolvedValue(undefined);

async function setup(entries: DefaultListEntry[] = []) {
  const { useCreateAndNavigateToList } = await import('@/hooks/useCreateAndNavigateToList');
  const { useDefaultList } = await import('@/hooks/useDefaultList');

  vi.mocked(useCreateAndNavigateToList).mockReturnValue({
    createAndNavigate: mockCreateAndNavigate,
    isPending: false,
    isError: false,
  });
  vi.mocked(useDefaultList).mockReturnValue({
    data: entries,
  } as unknown as ReturnType<typeof useDefaultList>);

  const { default: NewListFab } = await import('@/components/organisms/NewListFab');
  render(createElement(NewListFab));
}

describe('NewListFab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a scratch list immediately (no chooser) when the default list is empty', async () => {
    await setup([]);
    fireEvent.click(screen.getByRole('button', { name: /new list/i }));
    expect(mockCreateAndNavigate).toHaveBeenCalledWith();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the chooser when the default list is non-empty', async () => {
    await setup([{ id: 'd1', item_id: 'i1', quantity: 1, unit: '', notes: '' }]);
    fireEvent.click(screen.getByRole('button', { name: /new list/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mockCreateAndNavigate).not.toHaveBeenCalled();
  });

  it('seeds from default when "Start from default list" is chosen', async () => {
    await setup([{ id: 'd1', item_id: 'i1', quantity: 1, unit: '', notes: '' }]);
    fireEvent.click(screen.getByRole('button', { name: /new list/i }));
    fireEvent.click(screen.getByRole('button', { name: /start from default list/i }));
    expect(mockCreateAndNavigate).toHaveBeenCalledWith({ seedFromDefault: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('creates a scratch list when "Start from scratch" is chosen', async () => {
    await setup([{ id: 'd1', item_id: 'i1', quantity: 1, unit: '', notes: '' }]);
    fireEvent.click(screen.getByRole('button', { name: /new list/i }));
    fireEvent.click(screen.getByRole('button', { name: /start from scratch/i }));
    expect(mockCreateAndNavigate).toHaveBeenCalledWith({ seedFromDefault: false });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
