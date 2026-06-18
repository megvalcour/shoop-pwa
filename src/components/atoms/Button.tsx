import { forwardRef } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'destructive';
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50',
  ghost: 'p-1 text-text-muted',
  destructive: 'p-1 text-destructive',
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
