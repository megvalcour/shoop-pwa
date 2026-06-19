interface AisleGroupProps {
  label: string;
  number?: string;
  color: string;
  tint: string;
  count: number;
  children: React.ReactNode;
}

export default function AisleGroup({ label, color, tint, count, children }: AisleGroupProps) {
  return (
    <div
      style={{
        border: '1px solid #eef1f7',
        borderLeft: `5px solid ${color}`,
        borderRadius: 16,
        boxShadow: '0 2px 10px rgba(15,23,42,.05)',
        animation: 'popIn 0.2s ease both',
        backgroundColor: '#ffffff',
      }}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span
          className="flex-1 text-xs font-bold uppercase tracking-wide"
          style={{ color }}
        >
          {label}
        </span>
        <span
          className="text-xs font-semibold rounded-full px-2 py-0.5"
          style={{ backgroundColor: tint, color }}
        >
          {count}
        </span>
      </div>
      <ul className="divide-y divide-[#f1f4f9]">
        {children}
      </ul>
    </div>
  );
}
