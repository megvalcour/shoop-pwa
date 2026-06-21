import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Passive update check so the app still notices new versions without the user
// pressing "Check for updates".
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type UpdateState = 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'error';

export interface PwaUpdate {
  /** A new service worker is waiting to take over (from the SW `waiting` event). */
  needRefresh: boolean;
  /** The app shell has been precached and is ready to work offline. */
  offlineReady: boolean;
  /** State machine driving the "Check for updates" button feedback. */
  updateState: UpdateState;
  /** Manually ask the browser to look for a newer service worker. */
  checkForUpdate: () => Promise<void>;
  /** Activate the waiting worker and reload onto the new build. */
  applyUpdate: () => Promise<void>;
}

/**
 * Registers the service worker exactly once (the plugin's auto-injection is
 * disabled) and derives the update state. Mounted at the app root via
 * `PwaUpdateContext.Provider` so the SW registers on app load — not only when
 * Settings is opened — while remaining a single registration point.
 */
export function usePwaUpdateController(): PwaUpdate {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>('idle');

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      intervalRef.current = setInterval(() => {
        if (registration.installing || !navigator.onLine) return;
        void registration.update().catch(() => {});
      }, UPDATE_CHECK_INTERVAL_MS);
    },
    onRegisterError() {
      setUpdateState('error');
    },
  });

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    const registration = registrationRef.current;
    if (!registration) {
      setUpdateState('error');
      return;
    }
    setUpdateState('checking');
    try {
      await registration.update();
      // `needRefresh` flips to true asynchronously via the SW `waiting` event;
      // reflect the immediate outcome here for instant button feedback.
      setUpdateState(registration.waiting ? 'update-available' : 'up-to-date');
    } catch {
      setUpdateState('error');
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    // Posts SKIP_WAITING to the waiting worker; the virtual module reloads the
    // page once it takes control. IndexedDB is untouched, so any pending DB
    // migrations run on the post-update reload — non-destructive by construction.
    await updateServiceWorker(true);
  }, [updateServiceWorker]);

  return { needRefresh, offlineReady, updateState, checkForUpdate, applyUpdate };
}

export const PwaUpdateContext = createContext<PwaUpdate | null>(null);

export function usePwaUpdate(): PwaUpdate {
  const ctx = useContext(PwaUpdateContext);
  if (!ctx) {
    throw new Error('usePwaUpdate must be used within a PwaUpdateContext provider');
  }
  return ctx;
}
