import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Button from '@/components/atoms/Button';

describe('Button', () => {
  it('defaults to type="button"', () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toHaveAttribute('type', 'button');
  });

  it('respects an explicit type="submit" override', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit');
  });

  it('renders primary variant', () => {
    render(<Button variant="primary">Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  });

  it('renders secondary variant', () => {
    render(<Button variant="secondary">Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  });

  it('renders ghost variant (default shape)', () => {
    render(<Button variant="ghost">Click</Button>);
    expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
  });

  it('renders ghost variant with icon shape', () => {
    render(
      <Button variant="ghost" shape="icon">
        X
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'X' });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('p-1');
  });

  it('renders danger variant (default shape) — solid full-size', () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('bg-destructive');
    expect(btn.className).not.toContain('p-1');
  });

  it('renders danger variant with icon shape — small icon affordance', () => {
    render(
      <Button variant="danger" shape="icon">
        🗑
      </Button>,
    );
    const btn = screen.getByRole('button', { name: '🗑' });
    expect(btn.className).toContain('p-1');
    expect(btn.className).toContain('text-destructive');
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
