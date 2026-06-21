import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShoppingListCard from '@/components/molecules/ShoppingListCard';
import type { ShoppingList } from '@/db/schema';

const LIST: ShoppingList = {
  id: 'sl-1',
  name: 'Oxford - June 1',
  created_at: '2026-06-01T00:00:00.000Z',
};

describe('ShoppingListCard', () => {
  it('renders the list name and formatted date', () => {
    render(<ShoppingListCard list={LIST} onClick={vi.fn()} />);
    expect(screen.getByText('Oxford - June 1')).toBeInTheDocument();
    expect(screen.getByText('June 1, 2026')).toBeInTheDocument();
  });

  it('calls onClick when the card body is clicked', () => {
    const onClick = vi.fn();
    render(<ShoppingListCard list={LIST} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Oxford - June 1' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render a delete affordance when onDelete is omitted', () => {
    render(<ShoppingListCard list={LIST} onClick={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /delete list/i })).not.toBeInTheDocument();
  });

  it('renders a delete affordance labelled with the list name when onDelete is provided', () => {
    render(<ShoppingListCard list={LIST} onClick={vi.fn()} onDelete={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Delete list: Oxford - June 1' }),
    ).toBeInTheDocument();
  });

  it('clicking delete calls onDelete and not the card onClick', () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();
    render(<ShoppingListCard list={LIST} onClick={onClick} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete list: Oxford - June 1' }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });
});
