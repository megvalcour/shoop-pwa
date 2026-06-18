import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Button from '@/components/atoms/Button';

describe('Button', () => {
  it('renders primary variant', () => {
    render(<Button variant="primary">Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  });

  it('renders ghost variant', () => {
    render(<Button variant="ghost">Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  });

  it('renders destructive variant', () => {
    render(<Button variant="destructive">Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  });

  it('passes disabled prop through', () => {
    render(<Button disabled>Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toBeDisabled();
  });

  it('calls onClick on click', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Click' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
