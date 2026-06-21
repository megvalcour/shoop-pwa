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

  it('img is removed from DOM when error event fires', () => {
    render(<StoreLogo slug="oxford-62" name="Oxford Market Basket #62" />);
    const img = screen.getByRole('img', { name: 'Oxford Market Basket #62' });
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
