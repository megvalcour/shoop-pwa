import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement } from 'react';

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useImportStore', () => ({ useImportStore: vi.fn() }));

const mockMutate = vi.fn();

async function setup(overrides: Record<string, unknown> = {}) {
  const { useImportStore } = await import('@/hooks/useImportStore');
  vi.mocked(useImportStore).mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isError: false,
    ...overrides,
  } as unknown as ReturnType<typeof useImportStore>);
  const { default: StoreImporter } = await import('@/components/organisms/StoreImporter');
  render(createElement(StoreImporter));
}

const VALID_JSON = JSON.stringify({
  name: 'My Corner Store',
  address: '1 Main St',
  aisles: [{ label: 'Produce', items: ['banana', 'apple'] }],
});

describe('StoreImporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previews a valid pasted store and creates it, navigating to its detail page', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText('Store JSON'), { target: { value: VALID_JSON } });

    expect(await screen.findByText('My Corner Store')).toBeInTheDocument();
    expect(screen.getByText('1 Main St')).toBeInTheDocument();
    expect(screen.getByText(/1 aisle · 2 example items/)).toBeInTheDocument();

    mockMutate.mockImplementation((_parsed, { onSuccess }) => onSuccess('store-7'));
    fireEvent.click(screen.getByRole('button', { name: 'Add store' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/stores/store-7'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('shows validation errors for invalid JSON and offers no Add button', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText('Store JSON'), { target: { value: '{ broken' } });

    expect(await screen.findByText(/valid json/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add store' })).not.toBeInTheDocument();
  });

  it('copies the prompt to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toMatch(/JSON/);
    expect(await screen.findByText('Copied!')).toBeInTheDocument();
  });
});
