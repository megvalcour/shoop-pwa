/**
 * The fixed Mon–Sun week grid for the Eat tab weekly plan (Phase 5 — ADR-0026/0029).
 *
 * This is the SINGLE source of truth for both the grid order and the
 * `meal_plan_entries.day` contract: a `day` value is always one of these
 * lower-case day-of-week keys (`'mon'…'sun'`). ADR-0026 deferred the `day` format
 * to Phase 5; Phase 5 fixes it here as a day-of-week key (one implicit "this week"
 * plan — no dates, no week picker). A future dated/multi-week feature would be a
 * new ADR, not an edit to this contract.
 *
 * Pure data — no imports from `db/`, `hooks/`, React, or the network.
 */

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayMeta {
  key: DayKey;
  /** Full label for the day heading. */
  label: string;
  /** Three-letter label for compact contexts. */
  short: string;
}

/** The ordered week, Monday first. Grid order and `day` key contract live here. */
export const DAYS: readonly DayMeta[] = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
];

/** The day keys in grid order. */
export const DAY_KEYS: readonly DayKey[] = DAYS.map((day) => day.key);

/** Whether a stored `day` string is a recognized grid key (guards orphan/legacy values). */
export function isDayKey(value: string): value is DayKey {
  return (DAY_KEYS as readonly string[]).includes(value);
}

/** An empty day-keyed record, every day initialized via `make`. */
export function emptyByDay<T>(make: () => T): Record<DayKey, T> {
  return DAY_KEYS.reduce(
    (acc, key) => {
      acc[key] = make();
      return acc;
    },
    {} as Record<DayKey, T>,
  );
}
