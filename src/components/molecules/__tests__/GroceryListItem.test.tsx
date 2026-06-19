import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GroceryListItem from '@/components/molecules/GroceryListItem';

const COLOR = '#2563eb';

describe('GroceryListItem', () => {
  it('renders without checked prop — no line-through class on name', () => {
    render(<GroceryListItem name="Milk" color={COLOR} />);
    const name = screen.getByText('Milk');
    expect(name.className).not.toContain('line-through');
  });

  it('renders with checked=true — name element has line-through class', () => {
    render(<GroceryListItem name="Milk" color={COLOR} checked={true} />);
    const name = screen.getByText('Milk');
    expect(name.className).toContain('line-through');
  });

  it('clicking the row calls onToggle', () => {
    const onToggle = vi.fn();
    render(<GroceryListItem name="Milk" color={COLOR} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('Milk').closest('li')!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('clicking the delete button does NOT call onToggle', () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(
      <GroceryListItem name="Milk" color={COLOR} onToggle={onToggle} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /delete item/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not render delete button when checked=true', () => {
    render(
      <GroceryListItem
        name="Milk"
        color={COLOR}
        checked={true}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /delete item/i })).not.toBeInTheDocument();
  });
});
