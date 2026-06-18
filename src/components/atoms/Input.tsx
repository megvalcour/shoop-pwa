import { forwardRef } from 'react';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  const base =
    'rounded-lg border border-border bg-card px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50';
  return <input ref={ref} className={className ? `${base} ${className}` : base} {...props} />;
});

Input.displayName = 'Input';

export default Input;
