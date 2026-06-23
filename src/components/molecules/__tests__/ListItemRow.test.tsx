import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ListItemRow from '@/components/molecules/ListItemRow';

describe('ListItemRow', () => {
  it('renders name and quantity', () => {
    render(<ListItemRow name="Milk" quantity={2} />);
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
  });

  it('unchecked: no line-through on name', () => {
    render(<ListItemRow name="Milk" quantity={1} checked={false} />);
    expect(screen.getByText('Milk').className).not.toContain('line-through');
  });

  it('checked: name has line-through class', () => {
    render(<ListItemRow name="Milk" quantity={1} checked />);
    expect(screen.getByText('Milk').className).toContain('line-through');
  });

  it('clicking the row calls onToggle', () => {
    const onToggle = vi.fn();
    render(<ListItemRow name="Milk" quantity={1} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('Milk').closest('li')!);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('clicking delete does NOT call onToggle', () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(<ListItemRow name="Milk" quantity={1} onToggle={onToggle} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /delete item/i }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders an injected badge slot without any sheet/picker', () => {
    render(
      <ListItemRow
        name="Eggs"
        quantity={1}
        badge={<span data-testid="badge">Dairy</span>}
      />,
    );
    expect(screen.getByTestId('badge')).toBeInTheDocument();
    // No picker sheet should be present
    expect(screen.queryByText('Choose aisle')).toBeNull();
  });

  it('shows no delete button when onDelete is omitted', () => {
    render(<ListItemRow name="Milk" quantity={1} />);
    expect(screen.queryByRole('button', { name: /delete item/i })).toBeNull();
  });
});
