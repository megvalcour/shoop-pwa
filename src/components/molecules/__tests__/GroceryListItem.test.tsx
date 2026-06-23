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

  it('uncategorized item: tapping the … badge opens the picker, not onToggle', () => {
    const onToggle = vi.fn();
    const onAisleChange = vi.fn();
    render(
      <GroceryListItem
        name="Kefir"
        quantity={1}
        onToggle={onToggle}
        isAnalyzing
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

  it('checked uncategorized item exposes no categorize affordance', () => {
    render(
      <GroceryListItem
        name="Kefir"
        quantity={1}
        checked
        isAnalyzing
        aisles={aisles}
        onAisleChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /categorize item/i })).toBeNull();
  });
});
