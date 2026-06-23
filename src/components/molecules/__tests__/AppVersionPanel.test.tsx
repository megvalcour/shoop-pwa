import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import AppVersionPanel, {
  type AppVersionPanelProps,
} from '@/components/molecules/AppVersionPanel';

function renderPanel(overrides: Partial<AppVersionPanelProps> = {}) {
  const props: AppVersionPanelProps = {
    version: '1.2.3',
    state: 'idle',
    updateAvailable: false,
    onCheck: vi.fn(),
    onApply: vi.fn(),
    ...overrides,
  };
  render(<AppVersionPanel {...props} />);
  return props;
}

describe('AppVersionPanel', () => {
  it('renders the app version string', () => {
    renderPanel({ version: '4.5.6' });
    expect(screen.getByText('Shoop v4.5.6')).toBeInTheDocument();
  });

  it('shows "Check for updates" when idle and wires the click', async () => {
    const props = renderPanel({ state: 'idle' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Check for updates' }));
    expect(props.onCheck).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled "Checking…" button while checking', () => {
    renderPanel({ state: 'checking' });
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
  });

  it('shows the up-to-date message', () => {
    renderPanel({ state: 'up-to-date' });
    expect(screen.getByText(/on the latest version/i)).toBeInTheDocument();
  });

  it('shows an error message when the check fails', () => {
    renderPanel({ state: 'error' });
    expect(screen.getByText(/couldn’t check for updates/i)).toBeInTheDocument();
  });

  it('shows "Update now" and wires onApply when an update is available', async () => {
    const props = renderPanel({ updateAvailable: true });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Update now' }));
    expect(props.onApply).toHaveBeenCalledTimes(1);
  });
});
