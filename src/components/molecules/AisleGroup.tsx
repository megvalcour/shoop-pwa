import { faCheck } from '@fortawesome/free-solid-svg-icons';
import Icon from '@/components/atoms/Icon';

interface AisleGroupProps {
  /** Pre-formatted header text. The caller owns label formatting. */
  header: string;
  children: React.ReactNode;
  /**
   * 'aisle' — a numbered aisle, headed by an inline "Aisle N — Label" (default).
   * 'muted' — a transient/secondary group (categorizing, uncategorized).
   * 'done'  — the completion group, marked with a quiet check chip.
   */
  variant?: 'aisle' | 'muted' | 'done';
}

/**
 * One aisle section of the shopping list. A numbered aisle is headed by an
 * inline "Aisle N — Label" (ADR-0023); the number sits in the label rather than
 * a filled placard tile, which read like a count. Named/transient sections show
 * a quiet label only; the completion group shows a check chip.
 */
export default function AisleGroup({ header, children, variant = 'aisle' }: AisleGroupProps) {
  const muted = variant === 'muted';
  const done = variant === 'done';

  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface/95 py-2 backdrop-blur-sm">
        {done && (
          <span
            aria-hidden="true"
            className="grid h-6 w-6 place-items-center rounded-md bg-tint text-[11px] text-primary"
          >
            <Icon icon={faCheck} />
          </span>
        )}
        <span
          className={`text-xs font-bold tracking-wider uppercase ${
            muted ? 'italic text-text-muted' : 'text-primary'
          }`}
        >
          {header}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-2 pb-1">{children}</ul>
    </section>
  );
}
