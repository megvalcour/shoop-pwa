import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImportTargetPicker from '@/components/molecules/ImportTargetPicker';
import type { ImportTarget } from '@/components/molecules/ImportTargetPicker';
import type { ShoppingList } from '@/db/schema';

const LISTS: ShoppingList[] = [
  { id: 'list-1', name: 'Weekend', created_at: '2026-06-02T00:00:00.000Z' },
  { id: 'list-2', name: 'Weekday', created_at: '2026-06-01T00:00:00.000Z' },
];

describe('ImportTargetPicker', () => {
  it('hides the existing-list option when the user has no lists', () => {
    render(
      <ImportTargetPicker lists={[]} target={{ kind: 'new' }} newListLabel="New list" onChange={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /existing list/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /default list/i })).toBeInTheDocument();
  });

  it('defaults the existing selection to the first list', () => {
    const onChange = vi.fn();
    render(
      <ImportTargetPicker lists={LISTS} target={{ kind: 'new' }} newListLabel="New list" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /existing list/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'existing', listId: 'list-1' });
  });

  it('lets the user pick a specific existing list', () => {
    const onChange = vi.fn();
    const target: ImportTarget = { kind: 'existing', listId: 'list-1' };
    render(
      <ImportTargetPicker lists={LISTS} target={target} newListLabel="New list" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Weekday' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'existing', listId: 'list-2' });
  });

  it('renders the supplied new-list label', () => {
    render(
      <ImportTargetPicker
        lists={[]}
        target={{ kind: 'new' }}
        newListLabel="New list · Pasta"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'New list · Pasta' })).toBeInTheDocument();
  });
});
