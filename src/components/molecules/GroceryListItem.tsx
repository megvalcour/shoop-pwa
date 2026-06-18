interface GroceryListItemProps {
  name: string;
  quantity: number;
}

export default function GroceryListItem({ name, quantity }: GroceryListItemProps) {
  return (
    <li className="px-4 py-3 bg-white rounded-lg shadow-sm flex items-center justify-between">
      <span className="font-medium text-text">{name}</span>
      <span className="text-sm text-text-muted">×{quantity}</span>
    </li>
  );
}
