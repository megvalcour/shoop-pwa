import { faCheck } from '@fortawesome/free-solid-svg-icons';
import Icon from '@/components/atoms/Icon';

interface AisleGroupProps {
  /** Pre-formatted header text. The caller owns label formatting. */
  header: string;
  children: React.ReactNode;
  /** Aisle number shown on the placard. Absent → no placard (named sections). */
  marker?: string;
  /**
   * 'aisle' — a numbered aisle, led by a placard (default).
   * 'muted' — a transient/secondary group (categorizing, uncategorized).
   * 'done'  — the completion group, marked with a quiet check chip.
   */
  variant?: 'aisle' | 'muted' | 'done';
}

/**
 * One aisle section of the shopping list. A numbered aisle is led by an "aisle
 * placard" — a small filled tile carrying the aisle number, like the numbered
 * sign hung over a real store aisle (ADR-0022). Named/transient sections show a
 * quiet label only; the completion group shows a check chip.
 */
export default function AisleGroup({ header, children, marker, variant = 'aisle' }: AisleGroupProps) {
  const muted = variant === 'muted';
  const done = variant === 'done';

  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface/95 py-2 backdrop-blur-sm">
        {done ? (
          <span
            aria-hidden="true"
            className="grid h-6 w-6 place-items-center rounded-md bg-tint text-[11px] text-primary"
          >
            <Icon icon={faCheck} />
          </span>
        ) : (
          marker && (
            <span
              aria-hidden="true"
              className="grid h-6 min-w-6 place-items-center rounded-md bg-primary px-1 text-[11px] font-bold tabular-nums text-primary-foreground"
            >
              {marker}
            </span>
          )
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
