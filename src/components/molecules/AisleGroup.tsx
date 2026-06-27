import { faCheck } from '@fortawesome/free-solid-svg-icons';
import Icon from '@/components/atoms/Icon';

interface AisleGroupProps {
  /** Pre-formatted header text. The caller owns label formatting. */
  header: string;
  children: React.ReactNode;
  /** Node label on the spine (e.g. an aisle number). Absent → a plain dot. */
  marker?: string;
  /**
   * 'aisle' — a numbered station on the path (default).
   * 'muted' — a transient/secondary group (categorizing, uncategorized).
   * 'done'  — the completion node, filled to mark the end of the walk.
   */
  variant?: 'aisle' | 'muted' | 'done';
}

/**
 * One station on the "aisle spine": a vertical wayfinding track down the list
 * with a node per aisle, mirroring the shopper's path through the store. The
 * node carries the aisle number; the completion node fills in at the bottom.
 */
export default function AisleGroup({ header, children, marker, variant = 'aisle' }: AisleGroupProps) {
  const muted = variant === 'muted';
  const done = variant === 'done';

  return (
    <section className="relative pl-9">
      {/* The spine: a continuous track the nodes ride down. */}
      <span
        aria-hidden="true"
        className={`absolute left-[17px] top-3 bottom-1 w-0.5 ${
          done ? 'bg-accent' : muted ? 'bg-border/60' : 'bg-border'
        }`}
      />
      <div className="sticky top-0 z-10 -ml-9 flex items-center gap-2 bg-surface/95 py-2 pr-4 pl-9 backdrop-blur-sm">
        {/* Station node, pinned to the spine and sticky with the header. */}
        <span
          aria-hidden="true"
          className={`absolute top-1/2 left-1 grid h-[26px] w-[26px] -translate-y-1/2 place-items-center rounded-full border-2 text-[11px] font-bold tabular-nums ${
            done
              ? 'border-accent bg-accent text-primary'
              : muted
                ? 'border-border bg-surface text-text-muted'
                : 'border-primary bg-card text-primary'
          }`}
        >
          {done ? (
            <Icon icon={faCheck} />
          ) : (
            (marker ?? <span className="h-1.5 w-1.5 rounded-full bg-current" />)
          )}
        </span>
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
