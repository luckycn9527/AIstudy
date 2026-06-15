import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  minHeight?: number;
}

/** Unified empty-state placeholder */
export function EmptyState({ icon, title, description, action, minHeight = 200 }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: `${minHeight}px`,
      textAlign: 'center',
      color: '#9CA3AF',
      padding: '32px',
    }}>
      {icon && <div style={{ marginBottom: '16px', opacity: 0.5 }}>{icon}</div>}
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#374151', margin: '0 0 6px 0' }}>{title}</h3>
      {description && <p style={{ fontSize: '13px', color: '#9CA3AF', margin: 0 }}>{description}</p>}
      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </div>
  );
}
