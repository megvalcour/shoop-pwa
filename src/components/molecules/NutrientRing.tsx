/**
 * A single %-of-target radial gauge for the Eat weekly-plan score (Phase 5 —
 * ADR-0028). Presentational, pure props: the arc length encodes percent-of-target
 * (clamped to a full ring for display; the true percent is shown as text), and the
 * under/on/over tone colors the arc via role tokens only.
 *
 * Accessibility is load-bearing for rings (ADR-0028 flagged the scoring viz):
 *  - the arc fill transition is `motion-safe:` only — no animation under
 *    `prefers-reduced-motion`;
 *  - color is NEVER the sole signal — every ring pairs with a text percent, a
 *    value/target readout, and an `aria-label` ("Protein: 82 of 120 g, 68% of
 *    target"), so the score is legible without seeing the radial fill.
 */

import type { ScoreTone } from '@/services/mealPlanScore';

export interface NutrientRingProps {
  label: string;
  /** Raw actual amount (rounded here, at the display edge). */
  value: number;
  /** Raw target amount. */
  target: number;
  unit: string;
  /** value / target as a fraction (0..n); shown as a percent. */
  pct: number;
  tone: ScoreTone;
  size?: 'sm' | 'md';
}

const SIZES = {
  sm: { box: 52, stroke: 5, percentClass: 'text-sm' },
  md: { box: 64, stroke: 6, percentClass: 'text-base' },
} as const;

/** Arc color by tone — role tokens only (no hardcoded hexes). */
const TONE_CLASS: Record<ScoreTone, string> = {
  good: 'text-primary',
  low: 'text-text-muted',
  high: 'text-destructive',
};

function round(value: number): string {
  return Math.round(value).toLocaleString();
}

export default function NutrientRing({
  label,
  value,
  target,
  unit,
  pct,
  tone,
  size = 'md',
}: NutrientRingProps) {
  const { box, stroke, percentClass } = SIZES[size];
  const radius = (box - stroke) / 2;
  const center = box / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = Math.max(0, Math.min(1, pct));
  const dashOffset = circumference * (1 - fill);
  const percent = Math.round(pct * 100);

  const valueText = `${round(value)} / ${round(target)} ${unit}`.trim();
  const ariaLabel = `${label}: ${round(value)} of ${round(target)} ${unit}, ${percent}% of target`;

  return (
    <div className="flex flex-col items-center gap-1 text-center" role="img" aria-label={ariaLabel}>
      <div className="relative" style={{ width: box, height: box }}>
        <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
          <circle
            className="text-border"
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
          />
          <circle
            className={`${TONE_CLASS[tone]} motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500`}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center font-display font-bold text-text ${percentClass}`}
        >
          {percent}%
        </span>
      </div>
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className="text-xs text-text-muted">{valueText}</span>
    </div>
  );
}
