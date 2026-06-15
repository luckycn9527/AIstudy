import { ReactNode, CSSProperties } from 'react';

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  className?: string;
  hoverable?: boolean;
}

/** Standard white card container with consistent border/shadow/radius */
export function Card({ children, style, onClick, className, hoverable }: CardProps) {
  const isInteractive = hoverable ?? Boolean(onClick);
  const classes = [className, isInteractive ? 'card-hoverable' : ''].filter(Boolean).join(' ');
  return (
    <div
      className={classes || undefined}
      onClick={onClick}
      style={{
        backgroundColor: '#fff',
        borderRadius: '14px',
        border: '1px solid #E5E7EB',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        padding: '24px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  action?: ReactNode;
  style?: CSSProperties;
}

/** Card header with title on left, optional action on right */
export function CardHeader({ title, action, style }: CardHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', ...style }}>
      {typeof title === 'string'
        ? <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1F2937' }}>{title}</h3>
        : title}
      {action}
    </div>
  );
}
