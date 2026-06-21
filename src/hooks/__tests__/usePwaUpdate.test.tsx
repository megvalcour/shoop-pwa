import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { PwaUpdateContext, usePwaUpdate, usePwaUpdateController } from '@/hooks/usePwaUpdate';

const mocks = vi.hoisted(() => ({
  updateServiceWorker: vi.fn<(reloadPage?: boolean) => Promise<void>>(),
  registration: {
    registered: false,
    update: vi.fn<() => Promise<void>>(),
    waiting: null as object | null,
    installing: null as object | null,
  },
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: {
    onRegisteredSW?: (swUrl: string, registration: unknown) => void;
  }) => {
    // Mirror the real module: fire onRegisteredSW once with the registration.
    if (!mocks.registration.registered) {
      mocks.registration.registered = true;
      options.onRegisteredSW?.('sw.js', mocks.registration);
    }
    return {
      needRefresh: [false, () => {}] as const,
      offlineReady: [false, () => {}] as const,
      updateServiceWorker: mocks.updateServiceWorker,
    };
  },
}));

function Wrapper({ children }: { children: ReactNode }) {
  const value = usePwaUpdateController();
  return <PwaUpdateContext.Provider value={value}>{children}</PwaUpdateContext.Provider>;
}

describe('usePwaUpdate', () => {
  beforeEach(() => {
    mocks.updateServiceWorker.mockReset().mockResolvedValue(undefined);
    mocks.registration.registered = false;
    mocks.registration.update = vi.fn().mockResolvedValue(undefined);
    mocks.registration.waiting = null;
    mocks.registration.installing = null;
  });

  it('starts in the idle state', () => {
    const { result } = renderHook(() => usePwaUpdate(), { wrapper: Wrapper });
    expect(result.current.updateState).toBe('idle');
  });

  it('reports up-to-date when no waiting worker appears after a check', async () => {
    const { result } = renderHook(() => usePwaUpdate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(mocks.registration.update).toHaveBeenCalledTimes(1);
    expect(result.current.updateState).toBe('up-to-date');
  });

  it('reports update-available when a waiting worker is present after a check', async () => {
    mocks.registration.waiting = {};
    const { result } = renderHook(() => usePwaUpdate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(result.current.updateState).toBe('update-available');
  });

  it('reports error when the update check rejects', async () => {
    mocks.registration.update = vi.fn().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePwaUpdate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.checkForUpdate();
    });

    expect(result.current.updateState).toBe('error');
  });

  it('applyUpdate activates the waiting worker and reloads', async () => {
    const { result } = renderHook(() => usePwaUpdate(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.applyUpdate();
    });

    expect(mocks.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
