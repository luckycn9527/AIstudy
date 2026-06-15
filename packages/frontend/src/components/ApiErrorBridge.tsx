import { useEffect } from 'react';
import { setApiErrorHandler } from '../services/api';
import { useToast } from './ui/ToastProvider';

/** Connects the global axios error interceptor to the toast system */
export function ApiErrorBridge() {
  const { error } = useToast();
  useEffect(() => {
    setApiErrorHandler(error);
  }, [error]);
  return null;
}
