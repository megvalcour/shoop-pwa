import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppVersionPanel from '@/components/molecules/AppVersionPanel';
import { usePwaUpdate, type PwaUpdate } from '@/hooks/usePwaUpdate';

vi.mock('@/hooks/usePwaUpdate', () => ({ usePwaUpdate: vi.fn() }));

const mockUsePwaUpdate = vi.mocked(usePwaUpdate);

function setup(overrides: Partial<PwaUpdate> = {}) {
  const value: PwaUpdate = {
    needRefresh: false,
    offlineReady: false,
    updateState: 'idle',
    checkForUpdate: vi.fn().mockResolvedValue(undefined),
    applyUpdate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  mockUsePwaUpdate.mockReturnValue(value);
  return value;
}

describe('AppVersionPanel', () => {
  beforeEach(() => {
    mockUsePwaUpdate.mockReset();
  });

  it('renders the app version string', () => {
    setup();
    render(<AppVersionPanel />);
    // __APP_VERSION__ is injected from package.json via Vite `define`.
    expect(screen.getByText(`Shoop v${__APP_VERSION__}`)).toBeInTheDocument();
  });

  it('shows "Check for updates" when idle and wires the click', async () => {
    const value = setup({ updateState: 'idle' });
    const user = userEvent.setup();
    render(<AppVersionPanel />);

    const button = screen.getByRole('button', { name: 'Check for updates' });
    await user.click(button);
    expect(value.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled "Checking…" button while checking', () => {
    setup({ updateState: 'checking' });
    render(<AppVersionPanel />);

    const button = screen.getByRole('button', { name: 'Checking…' });
    expect(button).toBeDisabled();
  });

  it('shows the up-to-date message', () => {
    setup({ updateState: 'up-to-date' });
    render(<AppVersionPanel />);
    expect(screen.getByText(/on the latest version/i)).toBeInTheDocument();
  });

  it('shows an error message when the check fails', () => {
    setup({ updateState: 'error' });
    render(<AppVersionPanel />);
    expect(screen.getByText(/couldn’t check for updates/i)).toBeInTheDocument();
  });

  it('swaps to "Update now" and wires applyUpdate when an update is available', async () => {
    const value = setup({ needRefresh: true });
    const user = userEvent.setup();
    render(<AppVersionPanel />);

    const button = screen.getByRole('button', { name: 'Update now' });
    await user.click(button);
    expect(value.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('shows "Update now" when updateState is update-available', () => {
    setup({ updateState: 'update-available' });
    render(<AppVersionPanel />);
    expect(screen.getByRole('button', { name: 'Update now' })).toBeInTheDocument();
  });
});
