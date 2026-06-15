import { ReactNode } from 'react';

type BadgeVariant = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  primary: { bg: '#EDE9FE', color: '#6248F1' },
  success: { bg: '#D1FAE5', color: '#065F46' },
  warning: { bg: '#FEF3C7', color: '#92400E' },
  danger: { bg: '#FEE2E2', color: '#991B1B' },
  neutral: { bg: '#F3F4F6', color: '#6B7280' },
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
  const s = VARIANT_STYLES[variant];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: 500,
      backgroundColor: s.bg,
      color: s.color,
    }}>
      {children}
    </span>
  );
}
