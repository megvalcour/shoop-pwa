import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { useCreateAndNavigateToList } from '@/hooks/useCreateAndNavigateToList';
import { useDefaultList } from '@/hooks/useDefaultList';
import NewListSheet from '@/components/molecules/NewListSheet';

interface NewListFabProps {
  /** Extra gating from the host route (e.g. lists still loading). */
  disabled?: boolean;
}

/**
 * Floating "new list" button. When the default list is non-empty it opens a
 * chooser (scratch vs. seed-from-default); otherwise it creates a scratch list
 * immediately, preserving the original single-tap behaviour.
 */
export default function NewListFab({ disabled = false }: NewListFabProps) {
  const { createAndNavigate, isPending: isCreating, isError } = useCreateAndNavigateToList();
  const { data: defaultEntries } = useDefaultList();
  const [chooserOpen, setChooserOpen] = useState(false);

  const hasDefault = (defaultEntries?.length ?? 0) > 0;

  function handleFabClick() {
    if (hasDefault) {
      setChooserOpen(true);
    } else {
      createAndNavigate();
    }
  }

  async function choose(seedFromDefault: boolean) {
    await createAndNavigate({ seedFromDefault });
    setChooserOpen(false);
  }

  return (
    <>
      {isError && !chooserOpen && (
        <p className="px-4 text-destructive text-sm mt-2">Failed to create list. Please try again.</p>
      )}

      <button
        type="button"
        aria-label="New list"
        disabled={isCreating || disabled}
        onClick={handleFabClick}
        className="fixed bottom-20 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-float flex items-center justify-center transition-transform active:scale-95 disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>

      {chooserOpen && (
        <NewListSheet
          isPending={isCreating}
          errorMessage={isError ? 'Failed to create list. Please try again.' : undefined}
          onScratch={() => choose(false)}
          onFromDefault={() => choose(true)}
          onCancel={() => setChooserOpen(false)}
        />
      )}
    </>
  );
}
