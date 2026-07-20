/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { authService } from './services/db';
import { UserProfile } from './types';
import WelcomeView from './components/WelcomeView';
import CtvDashboard from './components/CtvDashboard';
import AdminDashboard from './components/AdminDashboard';
import Toast, { ToastMessage } from './components/Toast';
import { Sparkles } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Helper to trigger toast notifications
  const showToast = (text: string, type: 'success' | 'error' | 'info') => {
    setToast({
      id: Math.random().toString(36).substr(2, 9),
      text,
      type,
    });
  };

  // Close toast helper
  const handleCloseToast = () => {
    setToast(null);
  };

  // Subscribe to real-time auth changes
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((user) => {
      setCurrentUser(user);
      setAuthChecking(false);
    });
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // Logout wrapper
  const handleLogout = async () => {
    try {
      await authService.signOut();
      setCurrentUser(null);
      showToast('Đã đăng xuất thành công!', 'info');
    } catch (err: any) {
      showToast(err.message || 'Không thể đăng xuất, vui lòng thử lại!', 'error');
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 font-sans">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/30 mb-3 animate-pulse">
            <Sparkles className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">HManager đang tải...</h2>
          <p className="text-slate-500 text-xs font-bold">Đồng bộ dữ liệu hệ thống thời gian thực</p>
          <div className="w-16 h-1 mx-auto bg-slate-200 rounded-full overflow-hidden mt-4">
            <div className="h-full bg-amber-500 rounded-full w-[40%] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Toast Notification Mount */}
      <Toast toast={toast} onClose={handleCloseToast} />

      {/* Main View Router */}
      {!currentUser ? (
        <WelcomeView onSuccess={setCurrentUser} showToast={showToast} />
      ) : currentUser.role === 'admin' ? (
        <AdminDashboard user={currentUser} onLogout={handleLogout} showToast={showToast} />
      ) : (
        <CtvDashboard user={currentUser} onLogout={handleLogout} showToast={showToast} />
      )}
    </div>
  );
}
