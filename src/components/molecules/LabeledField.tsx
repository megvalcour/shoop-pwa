/**
 * A presentational label + control row for forms (Eat profile, Phase 2). Wraps
 * an arbitrary control (the `Input` atom, a native `<select>`, a segmented
 * control) with a label, an optional trailing unit suffix, and optional error
 * text. No store access; themes via role tokens so it renders green under /eat.
 */

export interface LabeledFieldProps {
  /** The control's `id`, wired to the label via `htmlFor` for accessibility. */
  htmlFor: string;
  label: string;
  /** Optional unit shown to the right of the control (e.g. "lb", "cm"). */
  suffix?: string;
  /** Optional error message; when present the row reads as invalid. */
  error?: string;
  children: React.ReactNode;
}

export default function LabeledField({
  htmlFor,
  label,
  suffix,
  error,
  children,
}: LabeledFieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-text">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="flex-1">{children}</div>
        {suffix ? (
          <span className="text-sm text-text-muted shrink-0" aria-hidden="true">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <span id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
