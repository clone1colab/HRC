/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { authService } from '../services/db';
import { UserProfile } from '../types';
import { Mail, Lock, User, Send, ShieldAlert, Sparkles, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WelcomeViewProps {
  onSuccess: (user: UserProfile) => void;
  showToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

export default function WelcomeView({ onSuccess, showToast }: WelcomeViewProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [zaloName, setZaloName] = useState('');
  const [referredByCode, setReferredByCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Vui lòng nhập email và mật khẩu!', 'error');
      return;
    }

    if (!isLogin && !zaloName) {
      showToast('Vui lòng nhập tên Zalo để chúng tôi tiện liên hệ!', 'error');
      return;
    }

    setLoading(true);
    setPendingApproval(false);

    try {
      if (isLogin) {
        // Sign In
        const profile = await authService.signIn(email, password);
        showToast(`Đăng nhập thành công! Chào mừng ${profile.zaloName}.`, 'success');
        onSuccess(profile);
      } else {
        // Sign Up
        const profile = await authService.signUp(
          email,
          password,
          zaloName,
          referredByCode || null
        );

        showToast(`Đăng ký thành công! Chào mừng CTV ${profile.zaloName}.`, 'success');
        onSuccess(profile);
      }
    } catch (error: any) {
      console.error(error);
      const msg = error.message || 'Đã xảy ra lỗi, vui lòng thử lại!';
      if (msg.includes('chờ Admin xét duyệt')) {
        setPendingApproval(true);
      }
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-50 via-slate-50 to-orange-50/20 px-4 py-12 relative overflow-hidden">
      {/* Golden top decorative bar */}
      <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-95" />
      
      {/* Decorative blurred spots */}
      <div className="absolute top-[-10%] left-[-10%] w-[35%] h-[35%] rounded-full bg-amber-200/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[35%] h-[35%] rounded-full bg-yellow-200/20 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Logo & Name */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-500 text-slate-950 shadow-lg shadow-amber-500/30 mb-3 hover:scale-105 transition-transform duration-300">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mb-2 font-sans">
            Lead <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">CTV</span>
          </h1>
          <p className="text-slate-500 text-sm max-w-xs mx-auto font-medium">
            Hệ thống Quản lý Cộng tác viên & Khách hàng tiềm năng chuyên nghiệp
          </p>
        </motion.div>



        {/* Auth Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="bg-white border border-slate-200/60 rounded-3xl shadow-xl p-8 backdrop-blur-sm"
        >
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8 border border-slate-200/40 relative">
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setPendingApproval(false);
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all duration-300 relative z-10 cursor-pointer ${
                isLogin
                  ? 'bg-white text-amber-600 shadow-md shadow-amber-500/5'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Đăng Nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setPendingApproval(false);
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-all duration-300 relative z-10 cursor-pointer ${
                !isLogin
                  ? 'bg-white text-amber-600 shadow-md shadow-amber-500/5'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              Đăng Ký CTV
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="popLayout">
              {/* Zalo Name Field (Only for signup) */}
              {!isLogin && (
                <motion.div 
                  key="zaloName"
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-1.5 overflow-hidden"
                >
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">
                    Tên Zalo liên hệ <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <User className="w-5 h-5" />
                    </span>
                    <input
                      type="text"
                      required
                      value={zaloName}
                      onChange={(e) => setZaloName(e.target.value)}
                      placeholder="VD: Nguyễn Văn A (Zalo)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:bg-white transition-all duration-200"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">
                Địa chỉ Email <span className="text-amber-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="VD: ctv@gmail.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:bg-white transition-all duration-200"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1">
                Mật khẩu <span className="text-amber-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:bg-white transition-all duration-200"
                />
              </div>
            </div>

            {/* Referral Code Field (Only for signup) */}
            <AnimatePresence mode="popLayout">
              {!isLogin && (
                <motion.div 
                  key="referralCode"
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-1.5 overflow-hidden"
                >
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-1 flex items-center gap-1.5">
                    Mã giới thiệu (Nếu có)
                    <span className="text-[10px] text-slate-400 lowercase italic font-normal">
                      (Mã 6 số của CTV mời bạn)
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Send className="w-5 h-5" />
                    </span>
                    <input
                      type="text"
                      maxLength={6}
                      value={referredByCode}
                      onChange={(e) => setReferredByCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="VD: 123456"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:bg-white transition-all duration-200"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              whileHover={{ scale: 1.01 }}
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-500 disabled:opacity-50 text-slate-950 font-black rounded-2xl shadow-lg shadow-amber-500/20 transition-all duration-200 flex items-center justify-center gap-2 text-sm cursor-pointer mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : isLogin ? (
                'Đăng Nhập Ngay'
              ) : (
                'Đăng Ký Làm CTV'
              )}
            </motion.button>
          </form>

          {/* Quick Info */}
          <div className="mt-6 pt-6 border-t border-slate-100 text-center text-[11px] text-slate-400 font-bold">
            Hỗ trợ CTV qua Zalo trực tuyến 24/7.
          </div>
        </motion.div>
      </div>
    </div>
  );
}
