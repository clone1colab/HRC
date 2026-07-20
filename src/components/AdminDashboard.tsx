/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { UserProfile, Lead, LeadStatus } from '../types';
import {
  Users,
  CheckCircle,
  Clock,
  Search,
  UserCheck,
  Coins,
  FileSpreadsheet,
  AlertCircle,
  Briefcase,
  ChevronRight,
  Check,
  X,
  Edit2,
  PieChart as ChartIcon,
  HelpCircle,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface AdminDashboardProps {
  user: UserProfile;
  onLogout: () => void;
  showToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

export default function AdminDashboard({ user, onLogout, showToast }: AdminDashboardProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  // Search/Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [leadStatusFilter, setLeadStatusFilter] = useState<'all' | LeadStatus>('all');
  const [ctvFilter, setCtvFilter] = useState<string>('all');

  // Tabs
  const [activeTab, setActiveTab] = useState<'leads' | 'approve_ctv' | 'ctv_report'>('leads');

  // Interactive editing state for specific Lead
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<LeadStatus>('chua_check');
  const [editCommission, setEditCommission] = useState<number>(0);
  const [editParentCommission, setEditParentCommission] = useState<number>(0);
  const [editIsPaid, setEditIsPaid] = useState<boolean>(false);
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);

  // 1. Subscribe to Users (Realtime)
  useEffect(() => {
    const unsubUsers = dbService.subscribeUsers((fetchedUsers) => {
      setUsers(fetchedUsers);
    });
    return unsubUsers;
  }, []);

  // 2. Subscribe to Leads (Realtime)
  useEffect(() => {
    const unsubLeads = dbService.subscribeLeads((fetchedLeads) => {
      setLeads(fetchedLeads);
    });
    return unsubLeads;
  }, []);

  // Approve a CTV account
  const handleApproveCTV = async (uid: string) => {
    try {
      await dbService.approveUser(uid);
      showToast('Đã phê duyệt tài khoản Cộng tác viên thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Phê duyệt thất bại, vui lòng thử lại!', 'error');
    }
  };

  // Reject a CTV account (Delete registration request)
  const handleRejectCTV = async (uid: string) => {
    try {
      await dbService.rejectUser(uid);
      showToast('Đã từ chối và xoá yêu cầu đăng ký của Cộng tác viên!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Từ chối thất bại, vui lòng thử lại!', 'error');
    }
  };

  // Start editing a lead
  const startEditLead = (lead: Lead) => {
    setEditingLeadId(lead.id);
    setEditStatus(lead.status);
    setEditCommission(lead.commissionAmount || 0);
    setEditParentCommission(lead.parentCommissionAmount || 0);
    setEditIsPaid(lead.isPaidCommission || false);
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingLeadId(null);
  };

  // Save Lead Updates
  const handleUpdateLead = async (leadId: string) => {
    setSavingLeadId(leadId);
    try {
      const updates: Partial<Lead> = {
        status: editStatus,
        isPaidCommission: editIsPaid,
        commissionAmount: editStatus === 'chot_don' ? Number(editCommission) : 0,
        parentCommissionAmount: editStatus === 'chot_don' ? Number(editParentCommission) : 0,
      };

      await dbService.updateLead(leadId, updates);
      showToast('Cập nhật trạng thái khách hàng thành công!', 'success');
      setEditingLeadId(null);
    } catch (err: any) {
      showToast(err.message || 'Cập nhật thất bại, vui lòng thử lại!', 'error');
    } finally {
      setSavingLeadId(null);
    }
  };

  // Search and Filter logic
  const filteredLeads = leads.filter((lead) => {
    // Search query matches customerName or customerPhone (instant search)
    const matchesSearch = searchQuery.trim() === '' || 
      lead.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.customerPhone.includes(searchQuery);

    const matchesStatus = leadStatusFilter === 'all' || lead.status === leadStatusFilter;
    const matchesCtv = ctvFilter === 'all' || lead.ctvId === ctvFilter;

    return matchesSearch && matchesStatus && matchesCtv;
  });

  // Calculate statistics for overview blocks
  const unapprovedCtvs = users.filter((u) => u.role === 'ctv' && !u.isApproved);
  const totalApprovedCtvs = users.filter((u) => u.role === 'ctv' && u.isApproved).length;

  const totalClosedDeads = leads.filter((l) => l.status === 'chot_don');
  
  // Total direct commission paid vs pending
  const totalPaidCommissionAmount = totalClosedDeads
    .filter((l) => l.isPaidCommission)
    .reduce((sum, l) => sum + (l.commissionAmount || 0) + (l.parentCommissionAmount || 0), 0);

  const totalPendingCommissionAmount = totalClosedDeads
    .filter((l) => !l.isPaidCommission)
    .reduce((sum, l) => sum + (l.commissionAmount || 0) + (l.parentCommissionAmount || 0), 0);

  // Currency Formatter
  const formatVND = (num: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
  };

  // Compile individual stats per CTV for reports
  const ctvReports = users
    .filter((u) => u.role === 'ctv')
    .map((ctv) => {
      const directLeads = leads.filter((l) => l.ctvId === ctv.uid);
      const directClosedCount = directLeads.filter((l) => l.status === 'chot_don').length;

      const f1Leads = leads.filter((l) => l.parentCtvId === ctv.uid);
      const f1ClosedCount = f1Leads.filter((l) => l.status === 'chot_don').length;

      const directComm = directLeads
        .filter((l) => l.status === 'chot_don')
        .reduce((sum, l) => sum + (l.commissionAmount || 0), 0);

      const f1Comm = f1Leads
        .filter((l) => l.status === 'chot_don')
        .reduce((sum, l) => sum + (l.parentCommissionAmount || 0), 0);

      const totalCommDue = directComm + f1Comm;

      const totalCommPaid = directLeads
        .filter((l) => l.status === 'chot_don' && l.isPaidCommission)
        .reduce((sum, l) => sum + (l.commissionAmount || 0), 0) + 
        f1Leads
        .filter((l) => l.status === 'chot_don' && l.isPaidCommission)
        .reduce((sum, l) => sum + (l.parentCommissionAmount || 0), 0);

      const totalCommPending = totalCommDue - totalCommPaid;

      return {
        ...ctv,
        directClosedCount,
        f1ClosedCount,
        totalCommDue,
        totalCommPaid,
        totalCommPending,
      };
    });

  // Recharts Pie Chart Data
  const chuaCheckCount = leads.filter((l) => l.status === 'chua_check').length;
  const daCheckCount = leads.filter((l) => l.status === 'da_check').length;
  const chotDonCount = leads.filter((l) => l.status === 'chot_don').length;

  const leadStatusData = [
    { name: 'Chưa check', value: chuaCheckCount, color: '#f59e0b' },  // Gold
    { name: 'Đang check', value: daCheckCount, color: '#3b82f6' },    // Blue
    { name: 'Đã chốt đơn', value: chotDonCount, color: '#10b981' },  // Emerald
  ].filter((item) => item.value > 0);

  const commissionStructureData = [
    { name: 'Đã chi trả', value: totalPaidCommissionAmount, color: '#10b981' },     // Emerald
    { name: 'Chưa thanh toán', value: totalPendingCommissionAmount, color: '#f59e0b' }, // Amber
  ].filter((item) => item.value > 0);

  const isAllZeroLeads = leadStatusData.length === 0;
  const isAllZeroComm = commissionStructureData.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16 font-sans">
      {/* Top Banner Accent Line */}
      <div className="h-1.5 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 w-full" />

      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-white/90 border-b border-slate-200/80 backdrop-blur-md px-6 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400 to-yellow-500 flex items-center justify-center text-slate-900 font-extrabold text-lg shadow-md shadow-amber-500/25">
              A
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                Hệ Thống Quản Trị (Admin Panel)
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20 uppercase tracking-wide">
                  Master Admin
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">Zalo Admin: Lê Đức Nguyên ({user.email})</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onLogout}
              className="px-4 py-2 text-xs font-bold text-rose-600 hover:text-white hover:bg-rose-600 rounded-xl transition border border-rose-200 hover:border-rose-600 flex items-center gap-1.5 cursor-pointer bg-white shadow-sm"
            >
              Đăng xuất Admin
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8">
        
        {/* Core Admin Stats Overview Block */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-md transition-all">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-extrabold uppercase tracking-wide">Cộng tác viên</span>
              <div className="text-3xl font-black text-slate-900">{totalApprovedCtvs}</div>
              <p className="text-[10px] text-slate-400 font-semibold">Đã kích hoạt hoạt động</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
              <Users className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-md transition-all">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-extrabold uppercase tracking-wide">Tổng số khách</span>
              <div className="text-3xl font-black text-slate-900">{leads.length}</div>
              <p className="text-[10px] text-slate-400 font-semibold">Khách được CTV giới thiệu</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
              <Briefcase className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-md transition-all">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-extrabold uppercase tracking-wide">Hoa hồng đã trả</span>
              <div className="text-base font-black text-emerald-600">{formatVND(totalPaidCommissionAmount)}</div>
              <p className="text-[10px] text-slate-400 font-semibold">Đã duyệt chuyển tiền</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-sm">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex items-center justify-between hover:shadow-md transition-all">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-extrabold uppercase tracking-wide">Hoa hồng chưa trả</span>
              <div className="text-base font-black text-amber-600">{formatVND(totalPendingCommissionAmount)}</div>
              <p className="text-[10px] text-slate-400 font-semibold">Đợi CTV đối soát</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
              <Clock className="w-6 h-6" />
            </div>
          </div>

        </div>

        {/* System Interactive Charts Block (Side by Side Grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Chart 1: Customer Status */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-2">
              <ChartIcon className="w-4.5 h-4.5 text-amber-500" />
              Tỷ Lệ Trạng Thái Khách Hàng (Toàn Hệ Thống)
            </h3>
            <p className="text-xs text-slate-500 mb-6 font-medium">
              Thống kê tỷ lệ phân phối khách hàng chưa check, đang tư vấn, và đã chốt đơn thành công.
            </p>
            {isAllZeroLeads ? (
              <div className="flex flex-col items-center justify-center h-56 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-4 text-center">
                <HelpCircle className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-xs text-slate-400 font-bold">Chưa có dữ liệu phân tích</p>
                <p className="text-[10px] text-slate-400 mt-1">Hệ thống sẽ vẽ biểu đồ khi CTV bắt đầu gửi thông tin khách!</p>
              </div>
            ) : (
              <div className="h-56 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={leadStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
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

          {/* Chart 2: Commissions Paid vs Unpaid */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-2">
              <Coins className="w-4.5 h-4.5 text-emerald-500" />
              Tình Trạng Chi Trả Hoa Hồng (Toàn Hệ Thống)
            </h3>
            <p className="text-xs text-slate-500 mb-6 font-medium">
              So sánh tỷ lệ hoa hồng đã chuyển khoản so với phần ngân sách chờ đối soát thanh toán.
            </p>
            {isAllZeroComm ? (
              <div className="flex flex-col items-center justify-center h-56 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-4 text-center">
                <Coins className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-xs text-slate-400 font-bold">Chưa có dữ liệu hoa hồng</p>
                <p className="text-[10px] text-slate-400 mt-1">Biểu đồ sẽ xuất hiện khi phát sinh đơn hàng chốt thành công.</p>
              </div>
            ) : (
              <div className="h-56 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={commissionStructureData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={75}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {commissionStructureData.map((entry, index) => (
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
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 mb-6 overflow-x-auto gap-1">
          <button
            onClick={() => setActiveTab('leads')}
            className={`py-3.5 px-6 text-sm font-bold border-b-2 transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'leads'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-400 hover:text-slate-800'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Quản Lý & Tìm Kiếm Khách Hàng ({leads.length})
          </button>
          <button
            onClick={() => setActiveTab('ctv_report')}
            className={`py-3.5 px-6 text-sm font-bold border-b-2 transition flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'ctv_report'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-slate-400 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Thống Kê & Báo Cáo CTV ({ctvReports.length})
          </button>
        </div>

        {/* TAB CONTENT: QUẢN LÝ KHÁCH HÀNG */}
        {activeTab === 'leads' && (
          <div className="space-y-6">
            
            {/* Realtime Search & Filter Tool */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
              
              <div className="relative flex-1 w-full">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Gõ Tên hoặc Số Điện Thoại khách hàng để lọc nhanh..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-4 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
                <select
                  value={leadStatusFilter}
                  onChange={(e: any) => setLeadStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-slate-700 text-sm focus:outline-none focus:border-amber-500 cursor-pointer w-full sm:w-auto"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="chua_check">Chưa check</option>
                  <option value="da_check">Đang check</option>
                  <option value="chot_don">Đã chốt đơn</option>
                </select>

                <select
                  value={ctvFilter}
                  onChange={(e) => setCtvFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-slate-700 text-sm focus:outline-none focus:border-amber-500 cursor-pointer w-full sm:w-auto"
                >
                  <option value="all">Tất cả CTV</option>
                  {users
                    .filter((u) => u.role === 'ctv')
                    .map((c) => (
                      <option key={c.uid} value={c.uid}>
                        {c.zaloName} ({c.referralCode})
                      </option>
                    ))}
                </select>
              </div>

            </div>

            {/* Leads Table Card */}
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              {filteredLeads.length === 0 ? (
                <div className="p-16 text-center text-slate-400 bg-white">
                  <Briefcase className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-700">Chưa có dữ liệu</p>
                  <p className="text-xs text-slate-400 mt-1 font-semibold">Không tìm thấy khách hàng phù hợp với bộ lọc tìm kiếm.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-4 px-6">Khách Hàng</th>
                        <th className="py-4 px-6">Người Giới Thiệu (CTV)</th>
                        <th className="py-4 px-6">Chi Tiết Nhu Cầu</th>
                        <th className="py-4 px-6">Trạng Thái</th>
                        <th className="py-4 px-6">Hoa Hồng</th>
                        <th className="py-4 px-6 text-center">Hành Động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                      {filteredLeads.map((lead) => {
                        const isEditing = editingLeadId === lead.id;
                        
                        return (
                          <React.Fragment key={lead.id}>
                            <tr className={`hover:bg-slate-50 transition ${isEditing ? 'bg-slate-50' : ''}`}>
                              {/* 1. Customer Column */}
                              <td className="py-4 px-6">
                                <div className="font-bold text-slate-900">{lead.customerName}</div>
                                <div className="font-mono text-xs text-slate-400 mt-0.5">{lead.customerPhone}</div>
                              </td>

                              {/* 2. Referral CTV Column */}
                              <td className="py-4 px-6">
                                <div className="font-bold text-amber-700">{lead.ctvZaloName}</div>
                                <div className="text-xs text-slate-400 mt-0.5 font-semibold font-mono">
                                  Mã CTV: {lead.ctvReferralCode}
                                </div>
                                {lead.parentCtvId && (
                                  <div className="text-[10px] text-slate-400 mt-1 font-semibold">
                                    Tuyến trên: {users.find(u => u.uid === lead.parentCtvId)?.zaloName || 'Có CTV giới thiệu'}
                                  </div>
                                )}
                              </td>

                              {/* 3. Notes Column */}
                              <td className="py-4 px-6 max-w-xs">
                                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed font-semibold">
                                  {lead.note || <em className="text-slate-300">Không ghi chú</em>}
                                </p>
                                <span className="text-[10px] text-slate-400 font-mono mt-1 block font-semibold">
                                  {new Date(lead.createdAt).toLocaleDateString('vi-VN')}
                                </span>
                              </td>

                              {/* 4. Status badge Column */}
                              <td className="py-4 px-6">
                                {lead.status === 'chua_check' && (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                    Chưa check
                                  </span>
                                )}
                                {lead.status === 'da_check' && (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                    Đã check
                                  </span>
                                )}
                                {lead.status === 'chot_don' && (
                                  <div className="space-y-1">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Đã chốt đơn
                                    </span>
                                    <div className="block">
                                      {lead.isPaidCommission ? (
                                        <span className="inline-flex items-center text-[10px] font-extrabold text-emerald-600">
                                          ● Đã thanh toán
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center text-[10px] font-extrabold text-amber-600">
                                          ● Chờ thanh toán
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </td>

                              {/* 5. Commission Amount Column */}
                              <td className="py-4 px-6">
                                {lead.status === 'chot_don' ? (
                                  <div className="space-y-1.5 text-xs font-bold">
                                    <div>
                                      <span className="text-slate-400 font-normal">Trực tiếp: </span>
                                      <span className="text-emerald-600 font-black">{formatVND(lead.commissionAmount || 0)}</span>
                                    </div>
                                    {lead.parentCtvId && (
                                      <div>
                                        <span className="text-slate-400 font-normal">Tuyến trên: </span>
                                        <span className="text-amber-600 font-black">{formatVND(lead.parentCommissionAmount || 0)}</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-xs font-semibold">Chờ chốt đơn</span>
                                )}
                              </td>

                              {/* 6. Action button Column */}
                              <td className="py-4 px-6 text-center">
                                {!isEditing ? (
                                  <button
                                    onClick={() => startEditLead(lead)}
                                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition inline-flex items-center gap-1 cursor-pointer shadow-sm"
                                  >
                                    <Edit2 className="w-3 h-3" /> Cập nhật
                                  </button>
                                ) : (
                                  <span className="text-xs text-amber-600 font-bold">Đang cập nhật...</span>
                                )}
                              </td>
                            </tr>

                            {/* COLLAPSED EDITING CONTAINER INLINE */}
                            {isEditing && (
                              <tr>
                                <td colSpan={6} className="bg-slate-50/90 px-8 py-5 border-y border-slate-200 shadow-inner">
                                  <div className="flex flex-col lg:flex-row gap-6 items-end justify-between">
                                    
                                    {/* Left: inputs */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1 text-left">
                                      
                                      {/* Status Select */}
                                      <div className="space-y-1">
                                        <label className="text-xs font-extrabold text-slate-700 pl-1">Trạng thái xử lý khách</label>
                                        <select
                                          value={editStatus}
                                          onChange={(e: any) => setEditStatus(e.target.value)}
                                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition cursor-pointer"
                                        >
                                          <option value="chua_check">Chưa check</option>
                                          <option value="da_check">Đã check</option>
                                          <option value="chot_don">Đã chốt đơn</option>
                                        </select>
                                      </div>

                                      {/* Commission Direct (Only visible when status is Chốt Đơn) */}
                                      <div className={`space-y-1 transition-opacity ${editStatus === 'chot_don' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                        <label className="text-xs font-extrabold text-slate-700 pl-1">Hoa hồng cho CTV trực tiếp (VND)</label>
                                        <input
                                          type="number"
                                          disabled={editStatus !== 'chot_don'}
                                          value={editCommission}
                                          onChange={(e) => setEditCommission(Math.max(0, Number(e.target.value)))}
                                          placeholder="VD: 50000"
                                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition font-bold"
                                        />
                                      </div>

                                      {/* Parent Commission (Only visible when status is Chốt Đơn and there's a parentCTV) */}
                                      <div className={`space-y-1 transition-opacity ${editStatus === 'chot_don' && lead.parentCtvId ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                        <label className="text-xs font-extrabold text-slate-700 pl-1">
                                          Thưởng CTV tuyến trên (F0) (VND)
                                          {!lead.parentCtvId && <span className="text-[10px] text-slate-400 font-normal italic"> (Không có)</span>}
                                        </label>
                                        <input
                                          type="number"
                                          disabled={editStatus !== 'chot_don' || !lead.parentCtvId}
                                          value={editParentCommission}
                                          onChange={(e) => setEditParentCommission(Math.max(0, Number(e.target.value)))}
                                          placeholder="VD: 10000"
                                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-slate-900 text-sm focus:outline-none focus:border-amber-500 transition font-bold"
                                        />
                                      </div>

                                    </div>

                                    {/* Center Right: Checkbox for Commission Paid */}
                                    <div className={`flex items-center gap-2 py-2 shrink-0 ${editStatus === 'chot_don' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                      <input
                                        type="checkbox"
                                        id={`isPaid_${lead.id}`}
                                        disabled={editStatus !== 'chot_don'}
                                        checked={editIsPaid}
                                        onChange={(e) => setEditIsPaid(e.target.checked)}
                                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded cursor-pointer"
                                      />
                                      <label htmlFor={`isPaid_${lead.id}`} className="text-xs font-extrabold text-slate-700 cursor-pointer select-none">
                                        Đã chuyển tiền hoa hồng
                                      </label>
                                    </div>

                                    {/* Right: Actions */}
                                    <div className="flex gap-2 self-end shrink-0">
                                      <button
                                        onClick={() => handleUpdateLead(lead.id)}
                                        disabled={savingLeadId === lead.id}
                                        className="px-4 py-2 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-500 disabled:opacity-50 text-slate-900 text-xs font-extrabold rounded-xl transition flex items-center gap-1 cursor-pointer shadow-sm"
                                      >
                                        {savingLeadId === lead.id ? (
                                          <div className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                          <Check className="w-3.5 h-3.5" />
                                        )}
                                        Lưu lại
                                      </button>
                                      <button
                                        onClick={cancelEdit}
                                        className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-extrabold rounded-xl transition cursor-pointer shadow-sm"
                                      >
                                        Hủy
                                      </button>
                                    </div>

                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB CONTENT: THỐNG KÊ BÁO CÁO CTV */}
        {activeTab === 'ctv_report' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-left bg-white">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Báo cáo hiệu suất hoạt động từng CTV</h3>
                  <p className="text-xs text-slate-500 mt-1 font-semibold">Tổng hợp số lượng đơn hàng chốt thành công và chi tiết hoa hồng tích lũy trực tiếp + gián tiếp của từng CTV.</p>
                </div>
              </div>

              {ctvReports.length === 0 ? (
                <div className="p-16 text-center text-slate-400 bg-white">
                  <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-700">Chưa có Cộng tác viên</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-4 px-6">Cộng Tác Viên</th>
                        <th className="py-4 px-6">Mã/Tuyến trên</th>
                        <th className="py-4 px-6 text-center">Số đơn trực tiếp chốt</th>
                        <th className="py-4 px-6 text-center">Số đơn F1 chốt</th>
                        <th className="py-4 px-6 text-right">Tổng hoa hồng tích lũy</th>
                        <th className="py-4 px-6 text-right">Đã chuyển</th>
                        <th className="py-4 px-6 text-right">Còn nợ (Pending)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                      {ctvReports.map((report) => (
                        <tr key={report.uid} className="hover:bg-slate-50 transition">
                          <td className="py-4 px-6 text-left">
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {report.zaloName}
                              {!report.isApproved && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">
                                  Chưa duyệt
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5 font-semibold">{report.email}</div>
                          </td>
                          <td className="py-4 px-6 text-left">
                            <div className="font-mono text-xs font-black text-amber-700">Mã: {report.referralCode}</div>
                            {report.referredByCode && (
                              <div className="text-[10px] text-slate-400 mt-0.5 font-semibold">
                                Tuyến trên: {report.referredByCode}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-6 text-center font-bold text-slate-900">
                            {report.directClosedCount}
                          </td>
                          <td className="py-4 px-6 text-center font-bold text-amber-700">
                            {report.f1ClosedCount}
                          </td>
                          <td className="py-4 px-6 text-right font-black text-slate-900">
                            {formatVND(report.totalCommDue)}
                          </td>
                          <td className="py-4 px-6 text-right font-bold text-emerald-600">
                            {formatVND(report.totalCommPaid)}
                          </td>
                          <td className="py-4 px-6 text-right font-bold text-amber-600">
                            {formatVND(report.totalCommPending)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
