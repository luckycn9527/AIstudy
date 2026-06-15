import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Global error handler hook — set by ToastProvider integration
let globalErrorHandler: ((message: string) => void) | null = null;

export function setApiErrorHandler(handler: (message: string) => void) {
  globalErrorHandler = handler;
}

// Response interceptor: surface network/server errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't toast for expected 4xx that pages handle locally (validation, not-found)
    const status = error?.response?.status;
    const isExpectedClientError = status >= 400 && status < 500;

    if (!isExpectedClientError && globalErrorHandler) {
      const message = error?.response?.data?.error?.message
        || (error?.code === 'ERR_NETWORK' ? '网络连接失败，请检查后端服务' : '服务器错误，请稍后重试');
      globalErrorHandler(message);
    }
    return Promise.reject(error);
  },
);
