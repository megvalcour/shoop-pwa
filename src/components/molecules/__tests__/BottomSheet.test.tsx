import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomSheet from '@/components/molecules/BottomSheet';

describe('BottomSheet', () => {
  it('renders the title and children', () => {
    render(
      <BottomSheet title="Choose aisle" onClose={vi.fn()}>
        <p>body content</p>
      </BottomSheet>,
    );
    expect(screen.getByText('Choose aisle')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet title="Choose aisle" onClose={onClose}>
        <p>body</p>
      </BottomSheet>,
    );
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet title="Choose aisle" onClose={onClose}>
        <p>body</p>
      </BottomSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet title="Choose aisle" onClose={onClose}>
        <p>body</p>
      </BottomSheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
