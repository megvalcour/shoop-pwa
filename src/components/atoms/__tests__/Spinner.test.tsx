import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Spinner from '@/components/atoms/Spinner';

describe('Spinner', () => {
  it('renders with role="status" and a default accessible label', () => {
    render(<Spinner />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Loading');
  });

  it('uses a custom accessible label when provided', () => {
    render(<Spinner aria-label="Categorizing item" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Categorizing item');
  });
});
