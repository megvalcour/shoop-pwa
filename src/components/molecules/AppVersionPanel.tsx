import Button from '@/components/atoms/Button';
import { APP_VERSION } from '@/lib/appVersion';
import { usePwaUpdate } from '@/hooks/usePwaUpdate';

export default function AppVersionPanel() {
  const { needRefresh, updateState, checkForUpdate, applyUpdate } = usePwaUpdate();
  const updateAvailable = needRefresh || updateState === 'update-available';
  const checking = updateState === 'checking';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-text-muted text-sm">Shoop v{APP_VERSION}</p>

      {updateAvailable ? (
        <Button variant="primary" className="w-full" onClick={() => void applyUpdate()}>
          Update now
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="w-full"
          disabled={checking}
          onClick={() => void checkForUpdate()}
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>
      )}

      {updateState === 'up-to-date' && (
        <p className="text-text-muted text-sm">You&rsquo;re on the latest version.</p>
      )}
      {updateState === 'error' && (
        <p className="text-destructive text-sm">Couldn&rsquo;t check for updates.</p>
      )}
    </div>
  );
}
