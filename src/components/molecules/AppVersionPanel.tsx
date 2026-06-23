import Button from '@/components/atoms/Button';
import type { UpdateState } from '@/hooks/usePwaUpdate';

export interface AppVersionPanelProps {
  version: string;
  state: UpdateState;
  updateAvailable: boolean;
  onCheck: () => void;
  onApply: () => void;
}

export default function AppVersionPanel({
  version,
  state,
  updateAvailable,
  onCheck,
  onApply,
}: AppVersionPanelProps) {
  const checking = state === 'checking';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-text-muted text-sm">Shoop v{version}</p>

      {updateAvailable ? (
        <Button variant="primary" className="w-full" onClick={onApply}>
          Update now
        </Button>
      ) : (
        <Button variant="secondary" className="w-full" disabled={checking} onClick={onCheck}>
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>
      )}

      {state === 'up-to-date' && (
        <p className="text-text-muted text-sm">You&rsquo;re on the latest version.</p>
      )}
      {state === 'error' && (
        <p className="text-destructive text-sm">Couldn&rsquo;t check for updates.</p>
      )}
    </div>
  );
}
