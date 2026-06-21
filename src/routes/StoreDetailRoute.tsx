import { useParams } from 'react-router';
import { useStores } from '@/hooks/useStores';
import { useAisles } from '@/hooks/useAisles';
import StoreLogo from '@/components/atoms/StoreLogo';
import AisleCard from '@/components/molecules/AisleCard';

export default function StoreDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const { data: stores, isPending, isError } = useStores();
  const { data: aisles, isPending: aislesPending } = useAisles(id);
  const store = stores?.find((s) => s.id === id);

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
    if (!aisles || aisles.length === 0) {
      return <p className="text-text-muted text-sm">No aisles for this store yet.</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        {aisles.map((aisle) => (
          <AisleCard key={aisle.id} aisle={aisle} />
        ))}
      </div>
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

      <h2 className="font-display font-bold text-text text-lg mb-3">Aisles</h2>
      {renderAisles()}
    </div>
  );
}
