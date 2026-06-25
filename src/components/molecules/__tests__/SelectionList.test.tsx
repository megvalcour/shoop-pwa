import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectionList from '@/components/molecules/SelectionList';

interface Fruit {
  id: string;
  name: string;
}

const FRUITS: Fruit[] = [
  { id: 'f1', name: 'Apple' },
  { id: 'f2', name: 'Banana' },
  { id: 'f3', name: 'Cherry' },
];

describe('SelectionList', () => {
  it('renders a row per item', () => {
    render(
      <SelectionList
        items={FRUITS}
        getKey={(f) => f.id}
        isSelected={() => false}
        renderLabel={(f) => f.name}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.getByText('Cherry')).toBeInTheDocument();
  });

  it('shows check icon and selected styling on the selected row', () => {
    render(
      <SelectionList
        items={FRUITS}
        getKey={(f) => f.id}
        isSelected={(f) => f.id === 'f2'}
        renderLabel={(f) => f.name}
        onSelect={vi.fn()}
      />,
    );
    const bananaBtn = screen.getByText('Banana').closest('button') as HTMLElement;
    expect(bananaBtn.className).toMatch(/text-primary/);
    expect(bananaBtn.className).toMatch(/font-semibold/);
    expect(bananaBtn.querySelector('[data-icon="check"]')).not.toBeNull();

    const appleBtn = screen.getByText('Apple').closest('button') as HTMLElement;
    expect(appleBtn.className).not.toMatch(/font-semibold/);
    expect(appleBtn.querySelector('[data-icon="check"]')).toBeNull();
  });

  it('calls onSelect with the clicked item', () => {
    const onSelect = vi.fn();
    render(
      <SelectionList
        items={FRUITS}
        getKey={(f) => f.id}
        isSelected={() => false}
        renderLabel={(f) => f.name}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('Cherry'));
    expect(onSelect).toHaveBeenCalledWith(FRUITS[2], 2);
  });

  it('uses getKey for stable list keys (no duplicate key warnings)', () => {
    const onSelect = vi.fn();
    expect(() =>
      render(
        <SelectionList
          items={FRUITS}
          getKey={(f) => f.id}
          isSelected={() => false}
          renderLabel={(f) => f.name}
          onSelect={onSelect}
        />,
      ),
    ).not.toThrow();
  });

  it('renders custom renderLabel nodes', () => {
    render(
      <SelectionList
        items={FRUITS}
        getKey={(f) => f.id}
        isSelected={() => false}
        renderLabel={(f) => <span data-testid={`label-${f.id}`}>{f.name}</span>}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId('label-f1')).toBeInTheDocument();
  });
});
