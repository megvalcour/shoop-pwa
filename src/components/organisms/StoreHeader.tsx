import StoreLogo from '@/components/atoms/StoreLogo';
import { useActiveStore } from '@/hooks/useStores';

export default function StoreHeader() {
  const { data: store } = useActiveStore();

  return (
    <header className="bg-primary px-4 py-2 flex items-center gap-3 min-h-13">
      {store && (
        <>
          <StoreLogo slug={store.slug} name={store.name} />
          <div className="flex flex-col">
            <span className="font-display font-bold text-primary-foreground">{store.name}</span>
            <span className="text-primary-foreground/70 text-sm">{store.address}</span>
          </div>
        </>
      )}
    </header>
  );
}
