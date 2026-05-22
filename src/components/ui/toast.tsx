'use client';

import { useEffect, useState } from 'react';
import { Check, AlertCircle, X, Info } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onDismiss?: () => void;
}

export function Toast({ message, variant = 'success', duration = 4000, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setVisible(false); setTimeout(() => onDismiss?.(), 300); }, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);

  const styles = {
    success: 'bg-emerald-600 text-white border-emerald-700',
    error:   'bg-destructive text-white border-destructive/80',
    info:    'bg-primary text-primary-foreground border-primary/80',
  };
  const Icon = variant === 'success' ? Check : variant === 'error' ? AlertCircle : Info;

  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium min-w-[260px] max-w-sm transition-all duration-300 ${styles[variant]} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      role="alert"
    >
      <Icon size={16} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={() => { setVisible(false); setTimeout(() => onDismiss?.(), 300); }} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  );
}

// Simple imperative toast store for use without a provider
let _setToasts: React.Dispatch<React.SetStateAction<Array<{ id: number; message: string; variant: ToastVariant }>>> | null = null;
let _nextId = 0;

export function toast(message: string, variant: ToastVariant = 'success') {
  _setToasts?.(prev => [...prev, { id: _nextId++, message, variant }]);
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; variant: ToastVariant }>>([]);
  useEffect(() => { _setToasts = setToasts; return () => { _setToasts = null; }; }, []);
  return (
    <>
      {toasts.map(t => (
        <Toast
          key={t.id}
          message={t.message}
          variant={t.variant}
          onDismiss={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
        />
      ))}
    </>
  );
}
