import { ReactNode, CSSProperties } from 'react';

type ButtonVariant = 'primary' | 'success' | 'warning' | 'danger' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  style?: CSSProperties;
  title?: string;
  ariaLabel?: string;
}

const VARIANT_COLORS: Record<ButtonVariant, { bg: string; color: string; border: string; hoverBg: string }> = {
  primary: { bg: '#6248F1', color: '#fff', border: 'none', hoverBg: '#5235D4' },
  success: { bg: '#3A9B53', color: '#fff', border: 'none', hoverBg: '#2F8544' },
  warning: { bg: '#F59E0B', color: '#fff', border: 'none', hoverBg: '#D97706' },
  danger: { bg: '#EF4444', color: '#fff', border: 'none', hoverBg: '#DC2626' },
  outline: { bg: 'transparent', color: '#6248F1', border: '1px solid #6248F1', hoverBg: '#EDE9FE' },
  ghost: { bg: 'transparent', color: '#6B7280', border: 'none', hoverBg: '#F3F4F6' },
};

const SIZE_STYLES: Record<ButtonSize, { padding: string; fontSize: string }> = {
  sm: { padding: '6px 14px', fontSize: '13px' },
  md: { padding: '9px 18px', fontSize: '14px' },
  lg: { padding: '12px 28px', fontSize: '15px' },
};

export function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled = false, loading = false, type = 'button', style, title, ariaLabel,
}: ButtonProps) {
  const v = VARIANT_COLORS[variant];
  const s = SIZE_STYLES[size];
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      aria-label={ariaLabel}
      style={{
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 500,
        borderRadius: '8px',
        border: v.border,
        backgroundColor: isDisabled ? '#D1D5DB' : v.bg,
        color: isDisabled && variant !== 'outline' && variant !== 'ghost' ? '#fff' : (isDisabled ? '#9CA3AF' : v.color),
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.15s, transform 0.1s',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        ...style,
      }}
      onMouseEnter={(e) => { if (!isDisabled) e.currentTarget.style.backgroundColor = v.hoverBg; }}
      onMouseLeave={(e) => { if (!isDisabled) e.currentTarget.style.backgroundColor = v.bg; }}
    >
      {loading && <span className="spinner-dot" />}
      {children}
    </button>
  );
}
