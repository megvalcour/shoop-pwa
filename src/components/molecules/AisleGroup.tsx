interface AisleGroupProps {
  label: string;
  number?: string;
  children: React.ReactNode;
  isSpecial?: boolean;
}

export default function AisleGroup({ label, number, children, isSpecial = false }: AisleGroupProps) {
  const headerText = number ? `Aisle ${number} — ${label}` : label;

  return (
    <section>
      <div
        className={`sticky top-0 px-4 py-1 text-xs font-semibold uppercase tracking-wide bg-background ${
          isSpecial ? 'text-text-muted italic' : 'text-primary'
        }`}
      >
        {headerText}
      </div>
      <ul className="flex flex-col gap-2 mt-1">
        {children}
      </ul>
    </section>
  );
}
