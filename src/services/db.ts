/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserProfile, Lead, CTVStats } from '../types';

const STORAGE_CURRENT_USER_KEY = 'ctv_lead_current_user';

// --- AUTH SERVICE ---
export const authService = {
  // Sign up CTV
  signUp: async (email: string, password: string, zaloName: string, referredByCodeInput: string | null): Promise<UserProfile> => {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        zaloName,
        referredByCode: referredByCodeInput,
      }),
    });

    if (!response.ok) {
      let message = 'Đã xảy ra lỗi khi đăng ký.';
      try {
        const errData = await response.json();
        if (errData && errData.message) {
          message = errData.message;
        }
      } catch (e) {
        if (response.status >= 500) {
          message = `Hệ thống đang khởi động hoặc đang bận (Mã: ${response.status}). Vui lòng đợi 2-3 giây rồi bấm "Đăng Ký" lại nhé!`;
        } else {
          message = `Kết nối thất bại (Mã: ${response.status}). Vui lòng kiểm tra lại mạng Internet hoặc thử lại!`;
        }
      }
      throw new Error(message);
    }

    return await response.json();
  },

  // Sign in
  signIn: async (email: string, password: string): Promise<UserProfile> => {
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let message = 'Đăng nhập không thành công.';
      try {
        const errData = await response.json();
        if (errData && errData.message) {
          message = errData.message;
        }
      } catch (e) {
        if (response.status >= 500) {
          message = `Hệ thống đang khởi động hoặc đang bận (Mã: ${response.status}). Vui lòng thử lại sau giây lát!`;
        } else {
          message = `Kết nối thất bại (Mã: ${response.status}). Vui lòng kiểm tra lại mạng Internet!`;
        }
      }
      throw new Error(message);
    }

    const profile = await response.json() as UserProfile;
    localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(profile));
    return profile;
  },

  // Sign out
  signOut: async (): Promise<void> => {
    localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
  },

  // Watch Auth State with short polling to keep in sync across devices
  onAuthStateChanged: (callback: (user: UserProfile | null) => void) => {
    const checkAuth = async () => {
      const stored = localStorage.getItem(STORAGE_CURRENT_USER_KEY);
      if (!stored) {
        callback(null);
        return;
      }
      try {
        const cachedUser = JSON.parse(stored) as UserProfile;
        
        // Fetch fresh profile from server to check if approved, updated, or deleted
        const res = await fetch(`/api/users/profile?uid=${cachedUser.uid}`);
        if (res.ok) {
          const freshUser = await res.json() as UserProfile;
          
          // If approved status changed, or role changed, update local cache and trigger callback
          localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(freshUser));
          callback(freshUser);
        } else if (res.status === 404) {
          // If user deleted from database, sign out
          localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
          callback(null);
        } else {
          // If server is temporarily unreachable, fall back to cached user profile
          callback(cachedUser);
        }
      } catch (err) {
        // Fall back to cached stored user on network error
        try {
          const cachedUser = JSON.parse(stored) as UserProfile;
          callback(cachedUser);
        } catch (_) {
          callback(null);
        }
      }
    };

    // Initial check
    checkAuth();

    // Poll auth status every 3 seconds
    const interval = setInterval(checkAuth, 3000);
    return () => {
      clearInterval(interval);
    };
  },
};

// --- DATA SERVICE ---
export const dbService = {
  // Subscribe to Users list (Realtime Polling)
  subscribeUsers: (callback: (users: UserProfile[]) => void) => {
    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/users');
        if (res.ok) {
          const users = await res.json() as UserProfile[];
          callback(users);
        }
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    };

    fetchUsers();
    const interval = setInterval(fetchUsers, 3000);
    return () => {
      clearInterval(interval);
    };
  },

  // Approve a CTV account
  approveUser: async (uid: string): Promise<void> => {
    const res = await fetch('/api/users/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể phê duyệt CTV.');
    }
  },

  // Subscribe to Leads (Realtime Polling)
  subscribeLeads: (callback: (leads: Lead[]) => void) => {
    const fetchLeads = async () => {
      try {
        const res = await fetch('/api/leads');
        if (res.ok) {
          const leads = await res.json() as Lead[];
          callback(leads);
        }
      } catch (err) {
        console.error('Error fetching leads:', err);
      }
    };

    fetchLeads();
    const interval = setInterval(fetchLeads, 3000);
    return () => {
      clearInterval(interval);
    };
  },

  // Add a new Lead
  addLead: async (customerName: string, customerPhone: string, note: string, ctvUser: UserProfile): Promise<Lead> => {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName,
        customerPhone,
        note,
        ctvUser,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể gửi khách hàng lên hệ thống.');
    }

    return await res.json() as Lead;
  },

  // Update a Lead (Status, commission amount, paid status)
  updateLead: async (leadId: string, updates: Partial<Lead>): Promise<void> => {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể cập nhật thông tin khách hàng.');
    }
  },

  // Subscribe to statistics for a specific CTV (Realtime Polling)
  subscribeCTVStats: (ctvId: string, callback: (stats: CTVStats) => void) => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/stats?ctvId=${ctvId}`);
        if (res.ok) {
          const stats = await res.json() as CTVStats;
          callback(stats);
        }
      } catch (err) {
        console.error('Error fetching CTV stats:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => {
      clearInterval(interval);
    };
  },
};
