'use client';

import React, { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message, detail, confirmLabel = 'Confirm',
  variant = 'warning', onConfirm, onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = variant === 'danger';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-panel border border-border rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className={`shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${
              isDanger ? 'bg-danger/15' : 'bg-warning/15'
            }`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
                className={isDanger ? 'text-danger' : 'text-warning'}>
                <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575ZM8 5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5Zm1 6a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
              <p className="text-sm text-text-secondary mt-1">{message}</p>
              {detail && (
                <div className="mt-2 p-2 bg-surface rounded text-xs font-mono text-text-muted break-all">
                  {detail}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-surface/50 border-t border-border">
          <button onClick={onCancel}
            className="px-3 py-1.5 text-sm text-text-secondary border border-border rounded-md hover:bg-surface transition-colors">
            Cancel
          </button>
          <button ref={confirmRef} onClick={onConfirm}
            className={`px-3 py-1.5 text-sm text-white rounded-md hover:opacity-90 transition-opacity ${
              isDanger ? 'bg-danger' : 'bg-warning'
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const DESTRUCTIVE_METHODS = new Set(['DELETE', 'PATCH', 'PUT', 'POST']);

export function isDestructiveMethod(method: string): boolean {
  return DESTRUCTIVE_METHODS.has(method.toUpperCase());
}

export function getConfirmMessage(method: string, path: string): { title: string; message: string; variant: 'danger' | 'warning' } {
  const upper = method.toUpperCase();
  if (upper === 'DELETE') {
    return {
      title: 'Confirm DELETE Request',
      message: 'This will permanently delete data on the server. This action cannot be undone.',
      variant: 'danger',
    };
  }
  if (upper === 'PATCH' || upper === 'PUT') {
    return {
      title: `Confirm ${upper} Request`,
      message: 'This will modify data on the server.',
      variant: 'warning',
    };
  }
  // POST
  return {
    title: 'Confirm POST Request',
    message: 'This will create or modify data on the server.',
    variant: 'warning',
  };
}
