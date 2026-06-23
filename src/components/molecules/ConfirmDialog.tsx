import { useId } from 'react';
import Button from '@/components/atoms/Button';
import Modal from '@/components/molecules/Modal';

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isPending?: boolean;
  errorMessage?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  isPending = false,
  errorMessage,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();

  return (
    <Modal
      role="alertdialog"
      labelledById={titleId}
      describedById={messageId}
      onClose={onCancel}
    >
      <h2 id={titleId} className="font-semibold text-text text-lg">
        {title}
      </h2>
      <p id={messageId} className="text-sm text-text-muted">
        {message}
      </p>
      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel} disabled={isPending}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={isPending}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
