import { forwardRef } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'danger';
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50',
  // Neutral, full-size action (e.g. a dialog's Cancel/safe default).
  secondary: 'rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-text disabled:opacity-50',
  ghost: 'p-1 text-text-muted',
  // Inline icon affordance (e.g. a trash icon).
  destructive: 'p-1 text-destructive',
  // Solid, full-size destructive action (e.g. a dialog's Delete confirm).
  danger: 'rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-50',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'ghost', className, ...props }, ref) => {
    const base = variantClasses[variant];
    return (
      <button
        ref={ref}
        className={className ? `${base} ${className}` : base}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export default Button;
