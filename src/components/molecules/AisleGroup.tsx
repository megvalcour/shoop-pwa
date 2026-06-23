interface AisleGroupProps {
  /** Pre-formatted header text. The caller owns label formatting. */
  header: string;
  children: React.ReactNode;
  isSpecial?: boolean;
}

export default function AisleGroup({ header, children, isSpecial = false }: AisleGroupProps) {
  return (
    <section>
      <div
        className={`sticky top-0 px-4 py-1 text-xs font-semibold uppercase tracking-wide bg-background ${
          isSpecial ? 'text-text-muted italic' : 'text-primary'
        }`}
      >
        {header}
      </div>
      <ul className="flex flex-col gap-2 mt-1">
        {children}
      </ul>
    </section>
  );
}
