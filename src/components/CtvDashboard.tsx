/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { UserProfile, Lead, CTVStats } from '../types';
import {
  LogOut,
  User,
  Copy,
  PlusCircle,
  Users,
  Clock,
  CheckCircle,
  Check,
  ChevronRight,
  ShieldCheck,
  UserPlus,
  Coins,
  Search,
  BookOpen,
  PieChart as ChartIcon,
  HelpCircle,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface CtvDashboardProps {
  user: UserProfile;
  onLogout: () => void;
  showToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

export default function CtvDashboard({ user, onLogout, showToast }: CtvDashboardProps) {
  // Stats state
  const [stats, setStats] = useState<CTVStats>({
    directSalesCount: 0,
    f1SalesCount: 0,
    directCommission: 0,
    parentCommission: 0,
    totalCommissionPaid: 0,
    totalCommissionPending: 0,
  });

  // Leads list
  const [myLeads, setMyLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'chua_check' | 'da_check' | 'chot_don'>('all');

  // New lead form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // General UI States
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'leads' | 'f1_team'>('leads');
  const [chartType, setChartType] = useState<'leads' | 'commissions'>('leads');

  // 1. Subscribe to Realtime statistics
  useEffect(() => {
    const unsubStats = dbService.subscribeCTVStats(user.uid, (computedStats) => {
      setStats(computedStats);
    });
    return unsubStats;
  }, [user.uid]);

  // 2. Subscribe to Realtime Leads list
  useEffect(() => {
    const unsubLeads = dbService.subscribeLeads((leads) => {
      // Filter leads belonging directly to this CTV
      const direct = leads.filter((l) => l.ctvId === user.uid);
      setMyLeads(direct);
    });
    return unsubLeads;
  }, [user.uid]);

  // 3. Subscribe to Users to show F1 friends list
  useEffect(() => {
    const unsubUsers = dbService.subscribeUsers((users) => {
      setAllUsers(users);
    });
    return unsubUsers;
  }, []);

  // Filter leads based on query & selected status
  useEffect(() => {
    let result = [...myLeads];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.customerName.toLowerCase().includes(q) ||
          l.customerPhone.includes(q) ||
          (l.note && l.note.toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((l) => l.status === statusFilter);
    }

    setFilteredLeads(result);
  }, [myLeads, searchQuery, statusFilter]);

  // Copy Referral Code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(user.referralCode);
    setCopied(true);
    showToast('Đã sao chép mã giới thiệu vào bộ nhớ tạm!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  // Submit Lead Form
  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      showToast('Vui lòng điền đầy đủ tên và số điện thoại khách hàng!', 'error');
      return;
    }

    // Basic Vietnamese Phone validation
    const phoneRegex = /(84|0[3|5|7|8|9])+([0-8]{8})\b/g;
    if (!phoneRegex.test(customerPhone.trim().replace(/\s/g, ''))) {
      showToast('Số điện thoại không hợp lệ, vui lòng kiểm tra lại!', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await dbService.addLead(customerName.trim(), customerPhone.trim(), note.trim(), user);
      showToast('Gửi thông tin khách hàng thành công! Admin sẽ check ngay.', 'success');
      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setNote('');
    } catch (err: any) {
      showToast(err.message || 'Gửi khách hàng thất bại, vui lòng thử lại!', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Get F1 users count & list
  const f1Users = allUsers.filter((u) => u.referredByCode === user.referralCode);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'chua_check':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-500" /> Chưa check
          </span>
        );
      case 'da_check':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
            <ChevronRight className="w-3.5 h-3.5 text-blue-500" /> Đang check
          </span>
        );
      case 'chot_don':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Đã chốt đơn
          </span>
        );
      default:
        return null;
    }
  };

  const getCommissionBadge = (isPaid: boolean) => {
    if (isPaid) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          Đã thanh toán
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
        Chờ thanh toán
      </span>
    );
  };

  // Currency Formatter
  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  // 4. Chart Data Preparation
  const chuaCheckCount = myLeads.filter((l) => l.status === 'chua_check').length;
  const daCheckCount = myLeads.filter((l) => l.status === 'da_check').length;
  const chotDonCount = myLeads.filter((l) => l.status === 'chot_don').length;

  const leadStatusData = [
    { name: 'Chưa check', value: chuaCheckCount, color: '#f59e0b' },  // Amber/Gold
    { name: 'Đang check', value: daCheckCount, color: '#3b82f6' },    // Blue
    { name: 'Đã chốt', value: chotDonCount, color: '#10b981' },       // Emerald
  ].filter((item) => item.value > 0);

  const totalClosedCommission = stats.directCommission + stats.parentCommission;

  const commissionData = [
    { name: 'Hoa hồng trực tiếp', value: stats.directCommission, color: '#10b981' }, // Emerald
    { name: 'Thưởng gián tiếp (F1)', value: stats.parentCommission, color: '#f59e0b' }, // Amber/Gold
  ].filter((item) => item.value > 0);

  const isAllZeroLeads = leadStatusData.length === 0;
  const isAllZeroComm = commissionData.length === 0;

   return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16 font-sans relative overflow-hidden">
      {/* Decorative blurred spots */}
      <div className="absolute top-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-amber-100/30 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[20%] left-[-10%] w-[35%] h-[35%] rounded-full bg-yellow-100/20 blur-3xl pointer-events-none" />

      {/* Top Banner Accent Line */}
      <div className="h-1.5 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 w-full" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 border-b border-slate-200/80 backdrop-blur-md px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Brand & Badge */}
          <div className="flex items-center gap-3">
            <motion.div 
              initial={{ rotate: -10, scale: 0.9 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-yellow-500 flex items-center justify-center text-slate-900 font-black text-lg shadow-md shadow-amber-500/25"
            >
              C
            </motion.div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                Trang Cộng Tác Viên
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20 uppercase tracking-wide">
                  CTV Đã duyệt
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-semibold">Zalo: {user.zaloName} ({user.email})</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 self-end sm:self-center">
            <div className="bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-extrabold text-slate-700">
              <User className="w-3.5 h-3.5 text-slate-400" />
              Mã: <span className="font-mono text-amber-600 font-black">{user.referralCode}</span>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onLogout}
              className="px-3.5 py-1.5 text-xs font-bold text-rose-600 hover:text-white hover:bg-rose-600 rounded-xl transition border border-rose-200 hover:border-rose-600 flex items-center gap-1.5 cursor-pointer bg-white"
            >
              <LogOut className="w-3.5 h-3.5" /> Đăng xuất
            </motion.button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8">
        {/* Referral Link Box */}
        <motion.div 
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="bg-gradient-to-r from-amber-400 to-yellow-500 rounded-3xl p-6 sm:p-8 text-slate-900 shadow-xl mb-8 relative overflow-hidden border border-yellow-300"
        >
          <div className="absolute -right-16 -bottom-16 w-48 h-48 rounded-full bg-white/20 blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 top-[-50px] w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-950">
                Mời bạn bè cùng làm CTV để nhận thưởng trọn đời! 🚀
              </h2>
              <p className="text-slate-950/80 text-xs sm:text-sm leading-relaxed font-bold">
                Khi bạn bè của bạn (CTV F1) đăng ký qua Mã giới thiệu của bạn và chốt đơn thành công, bạn sẽ nhận được <span className="font-extrabold text-slate-950 underline decoration-2">hoa hồng thưởng gián tiếp (F0)</span> ngay lập tức từ hệ thống!
              </p>
            </div>

            {/* Code Box */}
            <div className="bg-white/80 border border-white backdrop-blur rounded-2xl p-4 shrink-0 flex flex-col items-center justify-center gap-2 text-center min-w-[200px] shadow-sm">
              <span className="text-xs text-slate-600 uppercase tracking-wider font-extrabold">
                Mã giới thiệu của tôi
              </span>
              <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200 font-mono text-xl font-black text-slate-900 tracking-widest relative">
                {user.referralCode}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleCopyCode}
                  className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-900 transition cursor-pointer"
                  title="Sao chép mã"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Stats & Pie Charts & Form (5 cols) */}
          <div className="lg:col-span-5 space-y-8">
            
            {/* Stat Cards Grid (Concurrent visual flows for quick review) */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="grid grid-cols-2 gap-4"
            >
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mb-3">
                  <CheckCircle className="w-4.5 h-4.5" />
                </div>
                <div className="text-2xl font-black text-slate-900">{stats.directSalesCount}</div>
                <div className="text-[11px] text-slate-500 font-bold mt-1">Đơn trực tiếp chốt</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center mb-3">
                  <Users className="w-4.5 h-4.5" />
                </div>
                <div className="text-2xl font-black text-slate-900">{stats.f1SalesCount}</div>
                <div className="text-[11px] text-slate-500 font-bold mt-1">Đơn bạn bè F1 chốt</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all col-span-2 sm:col-span-1">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center mb-3">
                  <Coins className="w-4.5 h-4.5 text-amber-600" />
                </div>
                <div className="text-sm font-black text-amber-600">{formatVND(totalClosedCommission)}</div>
                <div className="text-[11px] text-slate-500 font-bold mt-1">Tổng hoa hồng tích lũy</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all col-span-2 sm:col-span-1">
                <div className="w-8 h-8 rounded-lg bg-emerald-55 text-emerald-600 border border-emerald-100 flex items-center justify-center mb-3">
                  <Coins className="w-4.5 h-4.5" />
                </div>
                <div className="text-sm font-black text-emerald-700">{formatVND(stats.totalCommissionPaid)}</div>
                <div className="text-[11px] text-slate-500 font-bold mt-1">Đã nhận thanh toán</div>
              </div>
            </motion.div>

            {/* Quick Balance/Due Box */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl p-4 flex items-center justify-between shadow-md shadow-emerald-500/10"
            >
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-100">
                  Số dư đang đợi đối soát thanh toán
                </span>
                <div className="text-lg font-black text-white">{formatVND(stats.totalCommissionPending)}</div>
              </div>
              <div className="text-xs bg-white/20 text-white px-2.5 py-1 rounded-lg border border-white/30 font-extrabold">
                Chờ đối soát
              </div>
            </motion.div>

            {/* Visual Pie Charts Card */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <ChartIcon className="w-4.5 h-4.5 text-amber-500" />
                  Biểu đồ Phân tích
                </h3>
                {/* Visual Chart Switcher Tabs */}
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setChartType('leads')}
                    className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                      chartType === 'leads' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Khách hàng
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartType('commissions')}
                    className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                      chartType === 'commissions' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Hoa hồng
                  </button>
                </div>
              </div>

              {chartType === 'leads' ? (
                <div>
                  <p className="text-[11px] text-slate-500 mb-4 font-semibold">
                    Tỷ lệ trạng thái khách hàng mà bạn đã gửi lên hệ thống.
                  </p>
                  {isAllZeroLeads ? (
                    <div className="flex flex-col items-center justify-center h-48 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-4 text-center animate-fade-in">
                      <HelpCircle className="w-8 h-8 text-slate-300 mb-1.5" />
                      <p className="text-xs text-slate-400 font-bold">Chưa có dữ liệu khách hàng</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Nhập thông tin khách hàng ở form dưới để xem biểu đồ!</p>
                    </div>
                  ) : (
                    <div className="h-48 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={leadStatusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {leadStatusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`${value} khách`, 'Số lượng']} />
                          <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-[11px] text-slate-500 mb-4 font-semibold">
                    Cơ cấu nguồn thu nhập giữa giới thiệu trực tiếp và thưởng gián tiếp từ F1.
                  </p>
                  {isAllZeroComm ? (
                    <div className="flex flex-col items-center justify-center h-48 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-4 text-center animate-fade-in">
                      <Coins className="w-8 h-8 text-slate-300 mb-1.5" />
                      <p className="text-xs text-slate-400 font-bold">Chưa phát sinh hoa hồng</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Hoa hồng sẽ hiển thị sau khi đơn hàng được chốt!</p>
                    </div>
                  ) : (
                    <div className="h-48 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={commissionData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {commissionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [formatVND(value as number), 'Số tiền']} />
                          <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </motion.div>

            {/* Submit Lead Form (Thread 1: Sending client data immediately) */}
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm"
            >
              <h3 className="text-base font-bold text-slate-950 mb-1 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-amber-500" />
                Gửi thông tin Khách Hàng
              </h3>
              <p className="text-xs text-slate-500 mb-6 font-semibold">
                Khi có khách hàng quan tâm đến sản phẩm, hãy gửi ngay thông tin lên hệ thống. Admin sẽ tiến hành tư vấn ngay lập tức!
              </p>

              <form onSubmit={handleAddLead} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 pl-1">
                    Tên khách hàng <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Nhập tên khách hàng"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:bg-white transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 pl-1">
                    Số điện thoại khách <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Nhập SĐT khách hàng"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:bg-white transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 pl-1">Nhu cầu & Ghi chú thêm</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Khách cần tư vấn loại sản phẩm nào, thời gian nào tiện gọi điện..."
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:bg-white transition resize-none"
                  />
                </div>

                <motion.button
                  whileTap={{ scale: 0.99 }}
                  whileHover={{ scale: 1.01 }}
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-sm rounded-xl transition shadow-md shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Gửi Khách Hàng Lên Hệ Thống'
                  )}
                </motion.button>
              </form>
            </motion.div>
          </div>

          {/* Right Column: Tabbed Lists (7 cols) (Thread 2: Active monitoring list) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Tab Selection */}
            <div className="flex border-b border-slate-200/80 gap-1 overflow-x-auto">
              <button
                onClick={() => setActiveTab('leads')}
                className={`py-3 px-6 text-sm font-bold border-b-2 transition flex items-center gap-2 cursor-pointer shrink-0 ${
                  activeTab === 'leads'
                    ? 'border-amber-500 text-amber-600 font-extrabold'
                    : 'border-transparent text-slate-400 hover:text-slate-800'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                Danh sách Khách hàng ({myLeads.length})
              </button>
              <button
                onClick={() => setActiveTab('f1_team')}
                className={`py-3 px-6 text-sm font-bold border-b-2 transition flex items-center gap-2 cursor-pointer shrink-0 ${
                  activeTab === 'f1_team'
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-slate-400 hover:text-slate-800'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                Bạn bè đã giới thiệu F1 ({f1Users.length})
              </button>
            </div>

            <AnimatePresence mode="wait">
              {/* TAB CONTENT: LEADS LIST */}
              {activeTab === 'leads' && (
                <motion.div 
                  key="tab_leads"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  {/* Search / Filter box */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row gap-3 shadow-sm">
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <Search className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm khách hàng theo Tên, SĐT, Nhu cầu..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition"
                      />
                    </div>

                    <select
                      value={statusFilter}
                      onChange={(e: any) => setStatusFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-slate-700 text-sm focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="all">Tất cả trạng thái</option>
                      <option value="chua_check">Chưa check</option>
                      <option value="da_check">Đang check</option>
                      <option value="chot_don">Đã chốt đơn</option>
                    </select>
                  </div>

                  {/* Table Container */}
                  <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                    {filteredLeads.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 bg-white">
                        <Clock className="w-12 h-12 mx-auto text-slate-300 mb-3 animate-pulse" />
                        <p className="text-sm font-bold text-slate-700">Chưa tìm thấy khách hàng nào</p>
                        <p className="text-xs text-slate-400 mt-1 font-semibold">Hãy sử dụng Form bên trái để gửi khách hàng đầu tiên của bạn!</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                              <th className="py-4 px-6">Khách hàng</th>
                              <th className="py-4 px-6">Thông tin nhu cầu</th>
                              <th className="py-4 px-6">Trạng thái</th>
                              <th className="py-4 px-6 text-right">Hoa hồng</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                            {filteredLeads.map((lead) => (
                              <tr key={lead.id} className="hover:bg-slate-50/50 transition">
                                <td className="py-4 px-6">
                                  <div className="font-bold text-slate-900">{lead.customerName}</div>
                                  <div className="font-mono text-xs text-slate-400 mt-0.5">{lead.customerPhone}</div>
                                </td>
                                <td className="py-4 px-6 max-w-xs">
                                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-semibold">
                                    {lead.note || <em className="text-slate-300">Không có ghi chú</em>}
                                  </p>
                                  <span className="text-[10px] text-slate-400 font-mono mt-1 block font-semibold">
                                    {new Date(lead.createdAt).toLocaleDateString('vi-VN')}
                                  </span>
                                </td>
                                <td className="py-4 px-6 space-y-1.5">
                                  <div className="block">{getStatusBadge(lead.status)}</div>
                                  {lead.status === 'chot_don' && (
                                    <div className="block">{getCommissionBadge(lead.isPaidCommission)}</div>
                                  )}
                                </td>
                                <td className="py-4 px-6 text-right font-bold">
                                  {lead.status === 'chot_don' ? (
                                    <div className="space-y-1">
                                      <div className="text-emerald-600 font-black">
                                        +{formatVND(lead.commissionAmount || 0)}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-medium italic">
                                        Hoa hồng trực tiếp
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 italic text-xs font-semibold">Chờ chốt đơn</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* TAB CONTENT: F1 FRIENDS LIST */}
              {activeTab === 'f1_team' && (
                <motion.div 
                  key="tab_f1_team"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div className="bg-amber-50/50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
                    <UserPlus className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold text-amber-950">Mô hình giới thiệu CTV 2 cấp</h4>
                      <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                        Dưới đây là danh sách bạn bè đã dùng mã giới thiệu <span className="font-bold text-amber-700">{user.referralCode}</span> của bạn để tham gia hệ thống. Khi họ giới thiệu thành công 1 khách hàng và đơn hàng được chốt, bạn sẽ tự động được cộng thêm <span className="font-bold text-amber-700">Hoa hồng thưởng gián tiếp</span> do Admin thiết lập!
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                    {f1Users.length === 0 ? (
                      <div className="p-12 text-center text-slate-400">
                        <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                        <p className="text-sm font-bold text-slate-700">Chưa giới thiệu được CTV nào</p>
                        <p className="text-xs text-slate-400 mt-1 font-semibold">Gửi mã {user.referralCode} cho bạn bè đăng ký ngay để bắt đầu xây dựng đội nhóm!</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                              <th className="py-4 px-6">CTV F1</th>
                              <th className="py-4 px-6">Zalo liên hệ</th>
                              <th className="py-4 px-6">Ngày tham gia</th>
                              <th className="py-4 px-6 text-center">Trạng thái duyệt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                            {f1Users.map((f1) => (
                              <tr key={f1.uid} className="hover:bg-slate-50/50 transition">
                                <td className="py-4 px-6">
                                  <div className="font-bold text-slate-900">{f1.zaloName}</div>
                                  <div className="text-xs text-slate-400 mt-0.5">{f1.email}</div>
                                </td>
                                <td className="py-4 px-6 font-mono text-xs text-amber-700 font-bold">
                                  Zalo: {f1.zaloName}
                                </td>
                                <td className="py-4 px-6 text-slate-400 text-xs font-medium">
                                  {new Date(f1.createdAt).toLocaleDateString('vi-VN')}
                                </td>
                                <td className="py-4 px-6 text-center">
                                  {f1.isApproved ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <ShieldCheck className="w-3 h-3" /> Đang hoạt động
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                                      Đang chờ duyệt
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>
      </main>
    </div>
  );
}
