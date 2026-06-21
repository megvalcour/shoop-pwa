import { useState } from 'react';
import StoreLogo from '@/components/atoms/StoreLogo';
import StoreSwitcherSheet from '@/components/molecules/StoreSwitcherSheet';
import { useStores, useActiveStore } from '@/hooks/useStores';

export default function StoreHeader() {
  const { data: store } = useActiveStore();
  const { data: stores } = useStores();
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-primary px-4 py-2 flex items-center min-h-13">
      {store && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Switch store"
            className="flex items-center gap-3 text-left"
          >
            <StoreLogo slug={store.slug} name={store.name} />
            <span className="flex flex-col">
              <span className="font-display font-bold text-primary-foreground">{store.name}</span>
              <span className="text-primary-foreground/70 text-sm">{store.address}</span>
            </span>
          </button>
          {open && (
            <StoreSwitcherSheet
              stores={stores ?? []}
              currentStoreId={store.id}
              onClose={() => setOpen(false)}
            />
          )}
        </>
      )}
    </header>
  );
}
