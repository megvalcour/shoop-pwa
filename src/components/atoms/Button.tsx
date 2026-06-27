import { forwardRef } from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  shape?: 'default' | 'icon';
}

const variantShapeClasses: Record<
  NonNullable<ButtonProps['variant']>,
  Record<NonNullable<ButtonProps['shape']>, string>
> = {
  primary: {
    default:
      'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-card transition-transform active:scale-[0.98] disabled:opacity-50',
    icon: 'p-1 bg-primary text-primary-foreground',
  },
  secondary: {
    default:
      'rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-text disabled:opacity-50',
    icon: 'p-1 border border-border bg-card text-text',
  },
  // Low-emphasis: muted text. shape="default" suits text labels; shape="icon" suits close/action icons.
  ghost: {
    default: 'text-sm text-text-muted disabled:opacity-50',
    icon: 'p-1 text-text-muted',
  },
  // Destructive intent. shape="default" is a solid full-size button; shape="icon" is a small icon affordance.
  danger: {
    default:
      'rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-50',
    icon: 'p-1 text-destructive',
  },
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'ghost', shape = 'default', type = 'button', className, ...props }, ref) => {
    const base = variantShapeClasses[variant][shape];
    return (
      <button
        ref={ref}
        type={type}
        className={className ? `${base} ${className}` : base}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export default Button;
