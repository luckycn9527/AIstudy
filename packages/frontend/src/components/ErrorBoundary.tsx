import { Component, ReactNode, ErrorInfo } from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Global error boundary to prevent white-screen crashes */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] 渲染错误:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '40px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1F2937', margin: '0 0 8px 0' }}>
            页面出现了一点问题
          </h2>
          <p style={{ fontSize: '14px', color: '#9CA3AF', margin: '0 0 24px 0', maxWidth: '400px' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={this.handleReset}
              style={{ padding: '10px 24px', backgroundColor: '#6248F1', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
            >
              重试
            </button>
            <button
              onClick={() => { window.location.href = '/home'; }}
              style={{ padding: '10px 24px', backgroundColor: '#fff', color: '#6248F1', border: '1px solid #6248F1', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
            >
              返回首页
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
