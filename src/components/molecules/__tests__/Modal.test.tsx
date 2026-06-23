import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '@/components/molecules/Modal';

describe('Modal', () => {
  it('renders children', () => {
    render(
      <Modal onClose={vi.fn()}>
        <p>Hello modal</p>
      </Modal>,
    );
    expect(screen.getByText('Hello modal')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal onClose={onClose}>
        <p>content</p>
      </Modal>,
    );
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose on backdrop click when closeOnBackdrop is false', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal onClose={onClose} closeOnBackdrop={false}>
        <p>content</p>
      </Modal>,
    );
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose}>
        <p>content</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies the given role to the panel', () => {
    render(
      <Modal onClose={vi.fn()} role="alertdialog">
        <p>content</p>
      </Modal>,
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('defaults to role="dialog"', () => {
    render(
      <Modal onClose={vi.fn()}>
        <p>content</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('focuses a focusable element inside the panel on open', () => {
    render(
      <Modal onClose={vi.fn()}>
        <button>Click me</button>
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Click me' }));
  });
});
