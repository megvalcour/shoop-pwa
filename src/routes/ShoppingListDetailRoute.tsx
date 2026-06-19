import { useParams } from 'react-router';
import { useShoppingLists } from '@/hooks/useShoppingLists';
import { useListItems } from '@/hooks/useListItems';
import { useStores } from '@/hooks/useStores';
import { useAisles } from '@/hooks/useAisles';
import AddItemForm from '@/components/organisms/AddItemForm';
import ShoppingListBuilder from '@/components/organisms/ShoppingListBuilder';

export default function ShoppingListDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const { data: lists, isPending, isError } = useShoppingLists();
  const list = lists?.find((l) => l.id === id);
  const { data: stores } = useStores();
  const { data: aisles } = useAisles();
  const { data: listItems } = useListItems(id ?? '');

  if (!id) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-destructive">List not found.</span>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-muted">Loading…</span>
      </div>
    );
  }

  if (isError || !list) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-destructive">List not found.</span>
      </div>
    );
  }

  const store = stores?.[0];
  const aisleCount = aisles?.length ?? 0;
  const leftCount = (listItems ?? []).filter((li) => !li.checked).length;
  const gotCount = (listItems ?? []).filter((li) => li.checked).length;

  return (
    <div className="min-h-full flex flex-col">
      <header
        className="sticky top-0 z-20 px-5 pt-6 pb-8"
        style={{
          background: 'linear-gradient(140deg, #084887 0%, #0a63bd 55%, #1178d6 100%)',
        }}
      >
        {store && (
          <div className="flex items-center gap-2 mb-4">
            <span
              className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2 6.5L8 2l6 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path d="M6 15V9h4v6" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <div className="text-white font-semibold text-sm leading-tight">{store.name}</div>
              <div className="text-white/70 text-xs">
                {store.address} · {aisleCount} aisles mapped
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-white text-xl font-bold">Your list</span>
          <span
            className="text-xs font-semibold rounded-full px-3 py-1 text-white"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            {leftCount} left · {gotCount} got
          </span>
        </div>
      </header>

      <div className="px-4 -mt-5 relative z-30">
        <AddItemForm listId={id} />
      </div>

      <div className="flex-1 px-4 pt-5 pb-24">
        <ShoppingListBuilder listId={id} />
      </div>
    </div>
  );
}
