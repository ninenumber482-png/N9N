import { type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-yellow-400 text-black hover:bg-yellow-300 disabled:opacity-40',
  secondary: 'border border-[#1f2128] text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-40',
  ghost: 'text-zinc-400 hover:text-white disabled:opacity-40',
  danger: 'bg-red-500 text-white hover:bg-red-400 disabled:opacity-40',
  success: 'bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-40',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-[11px] font-bold rounded-lg',
  md: 'h-10 px-4 text-[13px] font-bold rounded-xl',
  lg: 'h-12 px-6 text-[15px] font-extrabold rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 transition-all active:scale-[0.97]
        ${variantStyles[variant]} ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
