import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StoreLogo from '@/components/atoms/StoreLogo';

describe('StoreLogo', () => {
  it('renders img with correct src derived from slug', () => {
    render(<StoreLogo slug="oxford-62" name="Oxford Market Basket #62" />);
    const img = screen.getByRole('img', { name: 'Oxford Market Basket #62' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/store-logos/oxford-62.png');
  });

  it('applies the default size class when no sizeClassName is given', () => {
    render(<StoreLogo slug="oxford-62" name="Oxford Market Basket #62" />);
    const img = screen.getByRole('img', { name: 'Oxford Market Basket #62' });
    expect(img).toHaveClass('h-9', 'w-9');
  });

  it('applies a custom size class when sizeClassName is provided', () => {
    render(<StoreLogo slug="oxford-62" name="Oxford Market Basket #62" sizeClassName="h-16 w-16" />);
    const img = screen.getByRole('img', { name: 'Oxford Market Basket #62' });
    expect(img).toHaveClass('h-16', 'w-16');
    expect(img).not.toHaveClass('h-9');
  });

  it('falls back to a generic icon badge when the image errors', () => {
    render(<StoreLogo slug="oxford-62" name="Oxford Market Basket #62" />);
    const img = screen.getByRole('img', { name: 'Oxford Market Basket #62' });
    fireEvent.error(img);
    // The <img> is replaced by an accessible icon badge, not removed entirely.
    expect(screen.queryByRole('img', { name: 'Oxford Market Basket #62' })).not.toHaveAttribute(
      'src',
    );
    const badge = screen.getByRole('img', { name: 'Oxford Market Basket #62' });
    expect(badge.querySelector('[data-icon="store"]')).toBeInTheDocument();
  });

  it('preserves the size class on the fallback badge', () => {
    render(<StoreLogo slug="general" name="General Store" sizeClassName="h-16 w-16" />);
    const img = screen.getByRole('img', { name: 'General Store' });
    fireEvent.error(img);
    const badge = screen.getByRole('img', { name: 'General Store' });
    expect(badge).toHaveClass('h-16', 'w-16');
  });

  it('uses the carrot icon for the General Store fallback', () => {
    render(<StoreLogo slug="general" name="General Store" />);
    const img = screen.getByRole('img', { name: 'General Store' });
    fireEvent.error(img);
    const badge = screen.getByRole('img', { name: 'General Store' });
    expect(badge.querySelector('[data-icon="carrot"]')).toBeInTheDocument();
  });

  it('re-attempts the image when the slug changes after an error', () => {
    // StoreHeader stays mounted across store switches: an error for one store
    // must not latch the fallback for the next store's logo.
    const { rerender } = render(<StoreLogo slug="general" name="General Store" />);
    fireEvent.error(screen.getByRole('img', { name: 'General Store' }));
    expect(
      screen.getByRole('img', { name: 'General Store' }).querySelector('[data-icon="carrot"]'),
    ).toBeInTheDocument();

    rerender(<StoreLogo slug="oxford-62" name="Oxford Market Basket #62" />);
    const img = screen.getByRole('img', { name: 'Oxford Market Basket #62' });
    expect(img).toHaveAttribute('src', '/store-logos/oxford-62.png');
  });
});
