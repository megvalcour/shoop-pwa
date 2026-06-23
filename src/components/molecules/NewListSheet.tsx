import { useId } from 'react';
import Button from '@/components/atoms/Button';
import Modal from '@/components/molecules/Modal';

export interface NewListSheetProps {
  isPending?: boolean;
  errorMessage?: string;
  onScratch: () => void;
  onFromDefault: () => void;
  onCancel: () => void;
}

/**
 * Presentational chooser shown when starting a new list while a non-empty
 * default list exists: start from scratch, or seed from the default list.
 */
export default function NewListSheet({
  isPending = false,
  errorMessage,
  onScratch,
  onFromDefault,
  onCancel,
}: NewListSheetProps) {
  const titleId = useId();

  return (
    <Modal labelledById={titleId} onClose={onCancel}>
      <h2 id={titleId} className="font-semibold text-text text-lg">
        New list
      </h2>
      <p className="text-sm text-text-muted">How would you like to start?</p>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
      <div className="flex flex-col gap-2 pt-1">
        <Button variant="primary" onClick={onFromDefault} disabled={isPending}>
          Start from default list
        </Button>
        <Button variant="secondary" onClick={onScratch} disabled={isPending}>
          Start from scratch
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
