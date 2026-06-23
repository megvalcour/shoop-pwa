import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GroceryListItem from '@/components/molecules/GroceryListItem';

describe('GroceryListItem', () => {
  it('renders without checked prop — no line-through class on name', () => {
    render(<GroceryListItem name="Milk" quantity={1} />);
    const name = screen.getByText('Milk');
    expect(name.className).not.toContain('line-through');
  });

  it('renders with checked=true — name element has line-through class', () => {
    render(<GroceryListItem name="Milk" quantity={1} checked={true} />);
    const name = screen.getByText('Milk');
    expect(name.className).toContain('line-through');
  });

  it('clicking the row calls onToggle', () => {
    const onToggle = vi.fn();
    render(<GroceryListItem name="Milk" quantity={1} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('Milk').closest('li')!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('clicking the delete button does NOT call onToggle', () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(<GroceryListItem name="Milk" quantity={1} onToggle={onToggle} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete item/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  const aisles = [
    { id: 'a1', store_id: 's1', number: '1', label: 'Dairy', sort_order: 0 },
    { id: 'a2', store_id: 's1', number: '2', label: 'Produce', sort_order: 1 },
  ];

  it('categorizing item: shows a non-interactive spinner badge, no picker; row still toggles', () => {
    const onToggle = vi.fn();
    const onAisleChange = vi.fn();
    render(
      <GroceryListItem
        name="Kefir"
        quantity={1}
        onToggle={onToggle}
        isCategorizing
        aisles={aisles}
        onAisleChange={onAisleChange}
      />,
    );

    // Status, not an action: the badge is not a button and opens no picker.
    expect(screen.getByLabelText('Categorizing item')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /categorize item/i })).toBeNull();
    expect(screen.queryByText('Choose aisle')).toBeNull();

    // The row itself still toggles.
    fireEvent.click(screen.getByText('Kefir').closest('li')!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('settled-uncategorized item: tapping Categorize opens the picker, not onToggle', () => {
    const onToggle = vi.fn();
    const onAisleChange = vi.fn();
    render(
      <GroceryListItem
        name="Kefir"
        quantity={1}
        onToggle={onToggle}
        aisles={aisles}
        onAisleChange={onAisleChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /categorize item/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText('Choose aisle')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dairy/i }));
    expect(onAisleChange).toHaveBeenCalledWith('a1');
  });

  it('item with an aisle label: tapping the aisle badge opens the picker', () => {
    const onToggle = vi.fn();
    const onAisleChange = vi.fn();
    render(
      <GroceryListItem
        name="Milk"
        quantity={1}
        onToggle={onToggle}
        aisleLabel="Dairy"
        currentAisleId="a1"
        aisles={aisles}
        onAisleChange={onAisleChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /change aisle: dairy/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText('Choose aisle')).toBeInTheDocument();
  });

  it('checked uncategorized item exposes no interactive badge', () => {
    render(
      <GroceryListItem
        name="Kefir"
        quantity={1}
        checked
        aisles={aisles}
        onAisleChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /categorize item/i })).toBeNull();
    expect(screen.queryByLabelText('Categorizing item')).toBeNull();
  });
});
