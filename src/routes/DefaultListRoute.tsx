import DefaultListEditor from '@/components/organisms/DefaultListEditor';

export default function DefaultListRoute() {
  return (
    <div className="flex flex-col px-4 py-4">
      <h1 className="font-display text-2xl font-bold text-text">Default List</h1>
      <p className="text-text-muted text-sm mt-1">
        Staples to seed new lists from. These items have no aisle until added to a list.
      </p>
      <DefaultListEditor />
    </div>
  );
}
