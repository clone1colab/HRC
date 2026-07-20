/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserProfile, Lead, CTVStats } from '../types';

const STORAGE_CURRENT_USER_KEY = 'ctv_lead_current_user';
const STORAGE_LOCAL_DB_KEY = 'ctv_lead_local_db';

// --- LOCAL STORAGE DATABASE HELPERS ---
interface LocalDb {
  users: any[];
  leads: any[];
}

function getLocalDb(): LocalDb {
  const stored = localStorage.getItem(STORAGE_LOCAL_DB_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.leads)) {
        return parsed;
      }
    } catch (e) {
      // ignore parsing error
    }
  }
  
  // Initial database state
  const initial: LocalDb = {
    users: [
      {
        uid: 'admin_default_uid',
        email: 'clone1phobo@gmail.com',
        password: 'nguyen2000',
        zaloName: 'Lê Đức Nguyên',
        role: 'admin',
        isApproved: true,
        referralCode: '123456',
        referredByCode: null,
        createdAt: new Date().toISOString(),
      }
    ],
    leads: []
  };
  localStorage.setItem(STORAGE_LOCAL_DB_KEY, JSON.stringify(initial));
  return initial;
}

function saveLocalDb(db: LocalDb) {
  localStorage.setItem(STORAGE_LOCAL_DB_KEY, JSON.stringify(db));
}

// --- SMART API FETCH UTILITY ---
async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  // 1. Try current origin (relative path)
  try {
    const response = await fetch(path, options);
    // If we get a real response from a running backend (even a validation error), return it.
    // If it's a 404, it means the API route doesn't exist on this origin (e.g. static hosting).
    if (response.status !== 404) {
      return response;
    }
  } catch (err) {
    // If it's a network connection error, proceed to fallback below
  }

  // 2. Try default localhost:3000 as fallback
  try {
    const absoluteUrl = `http://localhost:3000${path}`;
    const response = await fetch(absoluteUrl, options);
    if (response.status !== 404) {
      return response;
    }
  } catch (err) {
    // ignore
  }

  // 3. Throw a special error indicating that the server backend is unreachable/non-existent
  throw new Error('ROUTE_NOT_FOUND_OR_UNREACHABLE');
}

// --- LOCAL DB FALLBACK IMPLEMENTATIONS ---
const signUpLocal = async (email: string, password: string, zaloName: string, referredByCode: string | null): Promise<UserProfile> => {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();
  const cleanZaloName = zaloName.trim();
  const cleanReferredCode = referredByCode?.trim() || null;

  const dbData = getLocalDb();

  // Check unique email
  if (dbData.users.some((u: any) => u.email === cleanEmail)) {
    throw new Error('Email đã được đăng ký trong hệ thống!');
  }

  // Verify referral code if provided
  let parentCtv = null;
  if (cleanReferredCode) {
    parentCtv = dbData.users.find((u: any) => u.referralCode === cleanReferredCode);
    if (!parentCtv) {
      throw new Error('Mã giới thiệu không tồn tại trong hệ thống. Vui lòng kiểm tra lại!');
    }
  }

  // Generate unique 6-digit referral code
  const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();
  let referralCode = generateCode();
  let attempts = 0;
  while (dbData.users.some((u: any) => u.referralCode === referralCode) && attempts < 50) {
    referralCode = generateCode();
    attempts++;
  }

  const isAdminAccount = cleanEmail === 'clone1phobo@gmail.com';
  const role: 'admin' | 'ctv' = isAdminAccount ? 'admin' : 'ctv';
  const isApproved = isAdminAccount ? true : false;
  const uid = 'user_' + Math.random().toString(36).substr(2, 9);

  const newUser = {
    uid,
    email: cleanEmail,
    password: cleanPassword,
    zaloName: cleanZaloName,
    role,
    isApproved,
    referralCode,
    referredByCode: cleanReferredCode,
    createdAt: new Date().toISOString(),
  };

  dbData.users.push(newUser);
  saveLocalDb(dbData);

  const { password: _, ...profile } = newUser;
  return profile;
};

const signInLocal = async (email: string, password: string): Promise<UserProfile> => {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();
  const isAdminAccount = normalizedEmail === 'clone1phobo@gmail.com';
  const dbData = getLocalDb();

  let user = dbData.users.find((u: any) => u.email === normalizedEmail);

  if (!user) {
    // Auto-seed admin user if logging in for the first time
    if (isAdminAccount && cleanPassword === 'nguyen2000') {
      const referralCode = '123456';
      const uid = 'admin_default_uid';
      user = {
        uid,
        email: normalizedEmail,
        password: cleanPassword,
        zaloName: 'Lê Đức Nguyên',
        role: 'admin',
        isApproved: true,
        referralCode,
        referredByCode: null,
        createdAt: new Date().toISOString(),
      };
      dbData.users.push(user);
      saveLocalDb(dbData);
    } else {
      throw new Error('Tài khoản không tồn tại hoặc sai thông tin.');
    }
  }

  if (user.password !== cleanPassword) {
    throw new Error('Mật khẩu không chính xác.');
  }

  if (!user.isApproved && user.role !== 'admin') {
    throw new Error('Tài khoản của bạn đang chờ Admin phê duyệt. Vui lòng liên hệ Admin!');
  }

  const { password: _, ...profile } = user;
  return profile;
};

// --- AUTH SERVICE ---
export const authService = {
  // Sign up CTV
  signUp: async (email: string, password: string, zaloName: string, referredByCodeInput: string | null): Promise<UserProfile> => {
    try {
      const response = await apiFetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          zaloName,
          referredByCode: referredByCodeInput,
        }),
      });

      if (response.ok) {
        return await response.json();
      }

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
    } catch (err) {
      if (err instanceof Error && err.message === 'ROUTE_NOT_FOUND_OR_UNREACHABLE') {
        throw new Error('Hệ thống đang khởi động lại hoặc đồng bộ hóa dữ liệu. Vui lòng đợi 2-3 giây rồi bấm "Đăng Ký" lại nhé!');
      }
      throw err;
    }
  },

  // Sign in
  signIn: async (email: string, password: string): Promise<UserProfile> => {
    try {
      const response = await apiFetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const profile = await response.json() as UserProfile;
        localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(profile));
        return profile;
      }

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
    } catch (err) {
      if (err instanceof Error && err.message === 'ROUTE_NOT_FOUND_OR_UNREACHABLE') {
        throw new Error('Hệ thống đang khởi động lại hoặc đồng bộ hóa dữ liệu. Vui lòng đợi 2-3 giây rồi bấm "Đăng Nhập" lại nhé!');
      }
      throw err;
    }
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
        const res = await apiFetch(`/api/users/profile?uid=${cachedUser.uid}`);
        if (res.ok) {
          const freshUser = await res.json() as UserProfile;
          
          // If approved status changed, or role changed, update local cache and trigger callback
          localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(freshUser));
          callback(freshUser);
        } else if (res.status === 404) {
          // Verify if it is indeed an explicit "User not found" response from our server
          try {
            const data = await res.json();
            if (data && (data.message === 'User not found' || data.message === 'User has been deleted')) {
              localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
              callback(null);
            } else {
              callback(cachedUser);
            }
          } catch (e) {
            // Transient load balancer or server 404, keep session active
            callback(cachedUser);
          }
        } else {
          // If server is temporarily unreachable, fall back to cached user profile
          callback(cachedUser);
        }
      } catch (err) {
        // Fall back to local database
        try {
          const cachedUser = JSON.parse(stored) as UserProfile;
          const dbData = getLocalDb();
          const localUser = dbData.users.find((u: any) => u.uid === cachedUser.uid);
          if (localUser) {
            const { password: _, ...profile } = localUser;
            localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(profile));
            callback(profile);
          } else {
            localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
            callback(null);
          }
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
    const cached = localStorage.getItem('lead_ctv_users_cache');
    if (cached) {
      try {
        callback(JSON.parse(cached));
      } catch (e) {}
    }

    const fetchUsers = async () => {
      try {
        const res = await apiFetch('/api/users');
        if (res.ok) {
          const users = await res.json() as UserProfile[];
          localStorage.setItem('lead_ctv_users_cache', JSON.stringify(users));
          callback(users);
          return;
        }
      } catch (err) {
        // ignore to retain previous state/cache
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
    try {
      const res = await apiFetch('/api/users/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });

      if (res.ok) {
        return;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể phê duyệt CTV.');
    } catch (err) {
      if (err instanceof Error && err.message === 'ROUTE_NOT_FOUND_OR_UNREACHABLE') {
        throw new Error('Hệ thống đang khởi động lại hoặc đồng bộ hóa dữ liệu. Vui lòng đợi 2-3 giây rồi thử lại nhé!');
      }
      throw err;
    }
  },

  // Reject a CTV account (Delete from registration list)
  rejectUser: async (uid: string): Promise<void> => {
    try {
      const res = await apiFetch('/api/users/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });

      if (res.ok) {
        return;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể từ chối CTV.');
    } catch (err) {
      if (err instanceof Error && err.message === 'ROUTE_NOT_FOUND_OR_UNREACHABLE') {
        throw new Error('Hệ thống đang khởi động lại hoặc đồng bộ hóa dữ liệu. Vui lòng đợi 2-3 giây rồi thử lại nhé!');
      }
      throw err;
    }
  },

  // Subscribe to Leads (Realtime Polling)
  subscribeLeads: (callback: (leads: Lead[]) => void) => {
    const cached = localStorage.getItem('lead_ctv_leads_cache');
    if (cached) {
      try {
        callback(JSON.parse(cached));
      } catch (e) {}
    }

    const fetchLeads = async () => {
      try {
        const res = await apiFetch('/api/leads');
        if (res.ok) {
          const leads = await res.json() as Lead[];
          localStorage.setItem('lead_ctv_leads_cache', JSON.stringify(leads));
          callback(leads);
          return;
        }
      } catch (err) {
        // ignore to retain previous state/cache
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
    try {
      const res = await apiFetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerPhone,
          note,
          ctvUser,
        }),
      });

      if (res.ok) {
        return await res.json() as Lead;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể gửi khách hàng lên hệ thống.');
    } catch (err) {
      if (err instanceof Error && err.message === 'ROUTE_NOT_FOUND_OR_UNREACHABLE') {
        throw new Error('Hệ thống đang khởi động lại hoặc đồng bộ hóa dữ liệu. Vui lòng đợi 2-3 giây rồi bấm gửi lại nhé!');
      }
      throw err;
    }
  },

  // Update a Lead (Status, commission amount, paid status)
  updateLead: async (leadId: string, updates: Partial<Lead>): Promise<void> => {
    try {
      const res = await apiFetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        return;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể cập nhật thông tin khách hàng.');
    } catch (err) {
      if (err instanceof Error && err.message === 'ROUTE_NOT_FOUND_OR_UNREACHABLE') {
        throw new Error('Hệ thống đang khởi động lại hoặc đồng bộ hóa dữ liệu. Vui lòng đợi 2-3 giây rồi bấm lưu lại nhé!');
      }
      throw err;
    }
  },

  // Subscribe to statistics for a specific CTV (Realtime Polling)
  subscribeCTVStats: (ctvId: string, callback: (stats: CTVStats) => void) => {
    const cacheKey = `lead_ctv_stats_cache_${ctvId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        callback(JSON.parse(cached));
      } catch (e) {}
    }

    const fetchStats = async () => {
      try {
        const res = await apiFetch(`/api/stats?ctvId=${ctvId}`);
        if (res.ok) {
          const stats = await res.json() as CTVStats;
          localStorage.setItem(cacheKey, JSON.stringify(stats));
          callback(stats);
          return;
        }
      } catch (err) {
        // ignore
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => {
      clearInterval(interval);
    };
  },
};
