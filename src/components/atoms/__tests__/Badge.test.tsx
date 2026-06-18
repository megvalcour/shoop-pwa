import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Badge from '@/components/atoms/Badge';

describe('Badge', () => {
  it('renders as span when no onClick provided', () => {
    const { container } = render(<Badge>Aisle 5</Badge>);
    expect(container.querySelector('span')).toBeInTheDocument();
    expect(container.querySelector('button')).not.toBeInTheDocument();
  });

  it('renders as button when onClick provided', () => {
    render(<Badge onClick={vi.fn()}>Aisle 5</Badge>);
    expect(screen.getByRole('button', { name: 'Aisle 5' })).toBeInTheDocument();
  });

  it('renders default variant', () => {
    const { container } = render(<Badge variant="default">Label</Badge>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders muted variant', () => {
    const { container } = render(<Badge variant="muted">Label</Badge>);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('calls onClick on click', async () => {
    const onClick = vi.fn();
    render(<Badge onClick={onClick}>Aisle 5</Badge>);
    await userEvent.click(screen.getByRole('button', { name: 'Aisle 5' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
