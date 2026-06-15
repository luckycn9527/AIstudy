import { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TYPE_STYLES: Record<ToastType, { bg: string; color: string; border: string; icon: string }> = {
  success: { bg: '#D1FAE5', color: '#065F46', border: '#A7F3D0', icon: '✓' },
  error: { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA', icon: '✕' },
  info: { bg: '#EDE9FE', color: '#5235D4', border: '#DDD6FE', icon: 'i' },
};

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => removeToast(id), 3500);
  }, [removeToast]);

  const value = useMemo<ToastContextValue>(() => ({
    showToast,
    success: (m: string) => showToast(m, 'success'),
    error: (m: string) => showToast(m, 'error'),
    info: (m: string) => showToast(m, 'info'),
  }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'none',
      }}>
        {toasts.map((t) => {
          const s = TYPE_STYLES[t.type];
          return (
            <div
              key={t.id}
              onClick={() => removeToast(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                minWidth: '260px',
                maxWidth: '400px',
                padding: '12px 16px',
                backgroundColor: s.bg,
                color: s.color,
                border: `1px solid ${s.border}`,
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                fontSize: '14px',
                pointerEvents: 'auto',
                cursor: 'pointer',
                animation: 'toast-in 0.25s ease-out',
              }}
            >
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: s.color,
                color: s.bg,
                fontSize: '12px',
                fontWeight: 700,
                flexShrink: 0,
              }}>{s.icon}</span>
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
