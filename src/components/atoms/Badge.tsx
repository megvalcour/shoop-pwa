import type { ButtonHTMLAttributes } from 'react';

export interface BadgeProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'muted';
  children: React.ReactNode;
}

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'shrink-0 rounded px-1.5 py-0.5 text-xs bg-primary/10 text-primary',
  muted: 'shrink-0 rounded px-1.5 py-0.5 text-xs bg-surface text-text-muted',
};

export default function Badge({ variant = 'default', className, onClick, children, ...props }: BadgeProps) {
  const base = variantClasses[variant];
  const cls = className ? `${base} ${className}` : base;

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} {...props}>
        {children}
      </button>
    );
  }

  return (
    <span className={cls} {...(props as React.HTMLAttributes<HTMLSpanElement>)}>
      {children}
    </span>
  );
}
