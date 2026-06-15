import { CSSProperties } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: CSSProperties;
}

/** Shimmer loading placeholder */
export function Skeleton({ width = '100%', height = 16, borderRadius = 6, style }: SkeletonProps) {
  return (
    <div
      className="skeleton-shimmer"
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

/** A card-shaped skeleton */
export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #E5E7EB', padding: '24px' }}>
      <Skeleton width="40%" height={20} style={{ marginBottom: '16px' }} />
      <Skeleton width="100%" height={height} />
    </div>
  );
}

/** A list of row skeletons for loading lists */
export function SkeletonList({ rows = 4, rowHeight = 60 }: { rows?: number; rowHeight?: number }) {
  return (
    <div
      role="status"
      aria-label="加载中"
      aria-busy="true"
      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width="100%" height={rowHeight} borderRadius={10} />
      ))}
    </div>
  );
}
