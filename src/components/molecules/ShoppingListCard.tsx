import type { ShoppingList } from '@/db/schema';

interface ShoppingListCardProps {
  list: ShoppingList;
  onClick: () => void;
}

export default function ShoppingListCard({ list, onClick }: ShoppingListCardProps) {
  const formatted = new Date(list.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-3 bg-white rounded-lg shadow-sm flex flex-col gap-0.5 active:opacity-70"
    >
      <span className="font-medium text-text">{list.name}</span>
      <span className="text-sm text-text-muted">{formatted}</span>
    </button>
  );
}
