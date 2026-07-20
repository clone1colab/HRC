/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

export default function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const bgClasses = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error: 'bg-rose-50 text-rose-800 border-rose-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
  };

  const iconComponents = {
    success: <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />,
    error: <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />,
    info: <Info className="w-5 h-5 text-sky-600 shrink-0" />,
  };

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full animate-fade-in-down">
      <div className={`p-4 rounded-xl border shadow-lg flex items-start gap-3 backdrop-blur-md bg-opacity-95 ${bgClasses[toast.type]}`}>
        {iconComponents[toast.type]}
        <div className="flex-1 text-sm font-medium leading-5">{toast.text}</div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 rounded-lg p-0.5 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
