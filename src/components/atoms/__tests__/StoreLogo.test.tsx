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

  it('img is removed from DOM when error event fires', () => {
    render(<StoreLogo slug="oxford-62" name="Oxford Market Basket #62" />);
    const img = screen.getByRole('img', { name: 'Oxford Market Basket #62' });
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
