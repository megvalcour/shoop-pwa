import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useStores, useActiveStore } from '@/hooks/useStores';
import { useSetActiveStoreId } from '@/hooks/usePreferences';
import { useAisles, useReorderAisles } from '@/hooks/useAisles';
import { useDeleteStore } from '@/hooks/useDeleteStore';
import { isBuiltInStore } from '@/db/idbClient';
import Badge from '@/components/atoms/Badge';
import Button from '@/components/atoms/Button';
import StoreLogo from '@/components/atoms/StoreLogo';
import ConfirmDialog from '@/components/molecules/ConfirmDialog';
import SortableAisleCard from '@/components/molecules/SortableAisleCard';
import type { Aisle } from '@/db/schema';

export default function StoreDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: stores, isPending, isError } = useStores();
  const { data: aisles, isPending: aislesPending } = useAisles(id);
  const reorderAisles = useReorderAisles();
  const { data: activeStore } = useActiveStore();
  const setActiveStoreId = useSetActiveStoreId();
  const deleteStore = useDeleteStore();
  const [confirming, setConfirming] = useState(false);
  const store = stores?.find((s) => s.id === id);

  // Mirror the fetched order locally so dragging feels instant and survives the
  // in-flight mutation. Re-sync whenever the query data changes (e.g. after an
  // optimistic rollback restores the previous order).
  const [order, setOrder] = useState<Aisle[]>([]);
  useEffect(() => {
    if (aisles) setOrder(aisles);
  }, [aisles]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !id) return;
    const oldIndex = order.findIndex((a) => a.id === active.id);
    const newIndex = order.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    reorderAisles.mutate({ storeId: id, orderedIds: next.map((a) => a.id) });
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-muted">Loading…</span>
      </div>
    );
  }

  if (!id || isError || !store) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-destructive">Store not found.</span>
      </div>
    );
  }

  function renderAisles() {
    if (aislesPending) return <p className="text-text-muted text-sm">Loading…</p>;
    if (order.length === 0) {
      return <p className="text-text-muted text-sm">No aisles for this store yet.</p>;
    }
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {order.map((aisle) => (
              <SortableAisleCard key={aisle.id} aisle={aisle} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <div className="flex flex-col px-4 py-4 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <StoreLogo slug={store.slug} name={store.name} sizeClassName="h-16 w-16" />
        <div className="flex flex-col min-w-0">
          <h1 className="font-display font-bold text-text text-xl truncate">{store.name}</h1>
          <span className="text-text-muted text-sm truncate">{store.address}</span>
        </div>
      </div>
      {store.id === activeStore?.id ? (
        <Badge className="mb-4 self-start">Current store</Badge>
      ) : (
        <Button
          variant="secondary"
          className="mb-4 self-start"
          onClick={() => setActiveStoreId.mutate(store.id)}
          disabled={setActiveStoreId.isPending}
        >
          Set as current store
        </Button>
      )}
      <h2 className="font-display font-bold text-text text-lg mb-3">Aisles</h2>
      {renderAisles()}
      {reorderAisles.isError && (
        <p className="text-destructive text-sm mt-3">Couldn&rsquo;t save order.</p>
      )}
      {!isBuiltInStore(store.id) && (
        <Button
          variant="danger"
          className="mt-8 self-start"
          onClick={() => setConfirming(true)}
        >
          Delete store
        </Button>
      )}
      {confirming && (
        <ConfirmDialog
          title="Delete this store?"
          message={`${store.name} and its aisles will be permanently deleted. Your shopping lists and saved items aren’t affected. This can’t be undone.`}
          confirmLabel="Delete"
          destructive
          isPending={deleteStore.isPending}
          errorMessage={
            deleteStore.isError ? 'Couldn’t delete the store. Please try again.' : undefined
          }
          onCancel={() => {
            deleteStore.reset();
            setConfirming(false);
          }}
          onConfirm={() =>
            deleteStore.mutate(store.id, { onSuccess: () => navigate('/settings') })
          }
        />
      )}
    </div>
  );
}
