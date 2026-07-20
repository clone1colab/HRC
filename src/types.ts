/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  uid: string;
  email: string;
  zaloName: string;
  role: 'admin' | 'ctv';
  isApproved: boolean;
  referralCode: string; // 6-digit random number (unique)
  referredByCode: string | null; // referral code of CTV who invited them
  createdAt: any; // Date, string, or Firestore Timestamp
}

export type LeadStatus = 'chua_check' | 'da_check' | 'chot_don';

export interface Lead {
  id: string;
  ctvId: string;
  ctvZaloName: string;
  ctvReferralCode: string;
  parentCtvId: string | null; // UID of the parent CTV
  customerName: string;
  customerPhone: string;
  note: string;
  status: LeadStatus;
  isPaidCommission: boolean;
  commissionAmount: number; // For CTV who directly referred
  parentCommissionAmount: number; // For parent CTV (referredBy) when this F1 has a successful lead
  createdAt: any;
}

export interface CTVStats {
  directSalesCount: number; // Số đơn chốt trực tiếp
  f1SalesCount: number; // Số đơn chốt của CTV F1 (bạn bè)
  directCommission: number; // Tổng hoa hồng trực tiếp nhận được
  parentCommission: number; // Tổng hoa hồng gián tiếp (thưởng giới thiệu F1)
  totalCommissionPaid: number; // Hoa hồng đã được chuyển tiền
  totalCommissionPending: number; // Hoa hồng chờ thanh toán
}
