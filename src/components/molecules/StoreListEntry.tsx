import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
import type { Store } from '@/db/schema';
import StoreLogo from '@/components/atoms/StoreLogo';

interface StoreListEntryProps {
  store: Store;
  onClick: () => void;
}

export default function StoreListEntry({ store, onClick }: StoreListEntryProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={store.name}
      className="flex items-center justify-between px-4 py-3 bg-surface rounded-xl text-text w-full text-left active:opacity-70"
    >
      <span className="flex items-center gap-3 min-w-0">
        <StoreLogo slug={store.slug} name={store.name} />
        <span className="flex flex-col min-w-0">
          <span className="font-medium truncate">{store.name}</span>
          <span className="text-sm text-text-muted truncate">{store.address}</span>
        </span>
      </span>
      <FontAwesomeIcon icon={faChevronRight} className="text-text-muted text-sm shrink-0 ml-3" />
    </button>
  );
}
