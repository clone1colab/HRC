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
  const attempts = 3;
  let delay = 1000;

  // Append cache buster to GET requests to prevent any aggressive browser/CDN caching
  const method = options.method || 'GET';
  let finalPath = path;
  if (method.toUpperCase() === 'GET') {
    const buster = `_t=${Date.now()}`;
    finalPath = path.includes('?') ? `${path}&${buster}` : `${path}?${buster}`;
  }

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(finalPath, options);
      // If we receive ANY response from the server (even a 404, 500, or validation error),
      // and it's an API route, return it immediately. The API server is up and functioning.
      if (response.status !== 404 || finalPath.startsWith('/api/')) {
        return response;
      }
    } catch (err) {
      // If it's a network/CORS error, retry unless we are out of attempts
      if (i === attempts - 1) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 1.5;
    }
  }

  // Fallback to localhost:3000 as a helper ONLY for local dev environments where frontend/backend might be on different ports
  try {
    const absoluteUrl = `http://localhost:3000${finalPath}`;
    const response = await fetch(absoluteUrl, options);
    if (response.status !== 404 || finalPath.startsWith('/api/')) {
      return response;
    }
  } catch (err) {
    // ignore
  }

  // Only throw if we truly cannot connect to any server endpoint
  throw new Error('ROUTE_NOT_FOUND_OR_UNREACHABLE');
}

// --- LOCAL DB FALLBACK IMPLEMENTATIONS ---
let leadListeners: ((leads: Lead[]) => void)[] = [];
const notifyLeadListeners = (leads: Lead[]) => {
  leadListeners.forEach((cb) => cb(leads));
};

let userListeners: ((users: UserProfile[]) => void)[] = [];
const notifyUserListeners = (users: UserProfile[]) => {
  userListeners.forEach((cb) => cb(users));
};

interface StatsListener {
  ctvId: string;
  callback: (stats: CTVStats) => void;
  fetchStats: () => void;
}
let statsListeners: StatsListener[] = [];

// Helper functions for WS
const getWsProtocol = () => {
  return window.location.protocol === 'https:' ? 'wss:' : 'ws:';
};

const getWsUrl = () => {
  const protocol = getWsProtocol();
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
};

// WebSocket Client Manager for Real-Time Synchronization
class WSClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private url: string = '';

  constructor() {
    this.url = getWsUrl();
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('[WS] Connected to real-time sync server.');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('[WS] Error processing message:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.warn('[WS] Connection closed:', event.reason);
        this.stopPing();
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Connection error:', err);
        this.ws?.close();
      };
    } catch (err) {
      console.error('[WS] Failed to connect:', err);
      this.scheduleReconnect();
    }
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[WS] Attempting to reconnect...');
      this.connect();
    }, 2000);
  }

  private handleMessage(data: any) {
    if (data.type === 'pong') return;

    console.log('[WS] Received real-time update event:', data.type);

    if (data.users) {
      localStorage.setItem('lead_ctv_users_cache', JSON.stringify(data.users));
      notifyUserListeners(data.users);
      
      const dbData = getLocalDb();
      dbData.users = data.users;
      saveLocalDb(dbData);
    }

    if (data.leads) {
      localStorage.setItem('lead_ctv_leads_cache', JSON.stringify(data.leads));
      notifyLeadListeners(data.leads);

      statsListeners.forEach((item) => {
        item.fetchStats();
      });

      const dbData = getLocalDb();
      dbData.leads = data.leads;
      saveLocalDb(dbData);
    }
    
    // Broadcast Custom Event for UI notifications
    if (data.type === 'user_registered') {
      const event = new CustomEvent('realtime:user_registered', { detail: data.user });
      window.dispatchEvent(event);
    } else if (data.type === 'lead_added') {
      const event = new CustomEvent('realtime:lead_added', { detail: data.lead });
      window.dispatchEvent(event);
    } else if (data.type === 'lead_updated') {
      const event = new CustomEvent('realtime:lead_updated', { detail: data });
      window.dispatchEvent(event);
    }
  }
}

const wsClient = typeof window !== 'undefined' ? new WSClient() : null;
if (wsClient) {
  wsClient.connect();
}
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
  const isApproved = true;
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
        const profile = await response.json() as UserProfile;
        const dbData = getLocalDb();
        if (!dbData.users.some((u: any) => u.uid === profile.uid)) {
          dbData.users.push({ ...profile, password });
          saveLocalDb(dbData);
        }
        dbService.syncDatabase().catch(() => {});
        return profile;
      }

      // Try local fallback if server fails
      try {
        const localProfile = await signUpLocal(email, password, zaloName, referredByCodeInput);
        if (localProfile) {
          dbService.syncDatabase().catch(() => {});
          return localProfile;
        }
      } catch (e) {
        // ignore fallback error, prefer server response below
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
      // Local fallback for offline/unreachable
      try {
        const localProfile = await signUpLocal(email, password, zaloName, referredByCodeInput);
        if (localProfile) {
          dbService.syncDatabase().catch(() => {});
          return localProfile;
        }
      } catch (localErr) {
        throw localErr;
      }

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

        // Sync local storage
        const dbData = getLocalDb();
        const existingIdx = dbData.users.findIndex((u: any) => u.uid === profile.uid);
        if (existingIdx === -1) {
          dbData.users.push({ ...profile, password });
        } else {
          dbData.users[existingIdx] = { ...dbData.users[existingIdx], ...profile, password };
        }
        saveLocalDb(dbData);

        dbService.syncDatabase().catch(() => {});
        return profile;
      }

      // Try local fallback (e.g. server reset/container restarted and lost memory)
      try {
        const localProfile = await signInLocal(email, password);
        if (localProfile) {
          localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(localProfile));
          dbService.syncDatabase().catch(() => {});
          return localProfile;
        }
      } catch (e) {
        // ignore fallback error
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
      // Local fallback for offline/unreachable
      try {
        const localProfile = await signInLocal(email, password);
        if (localProfile) {
          localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(localProfile));
          dbService.syncDatabase().catch(() => {});
          return localProfile;
        }
      } catch (localErr) {
        throw localErr;
      }

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

    // Silent database sync on auth state change load and periodically
    dbService.syncDatabase().catch(() => {});
    const syncInterval = setInterval(() => {
      dbService.syncDatabase().catch(() => {});
    }, 15000);

    return () => {
      clearInterval(interval);
      clearInterval(syncInterval);
    };
  },
};

// --- DATA SERVICE ---
export const dbService = {
  // Synchronize client LocalStorage database with server database
  syncDatabase: async (): Promise<void> => {
    try {
      const dbData = getLocalDb();
      const res = await apiFetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: dbData.users,
          leads: dbData.leads
        })
      });

      if (res.ok) {
        const result = await res.json() as { users: any[]; leads: any[] };
        if (result && Array.isArray(result.users) && Array.isArray(result.leads)) {
          // Update client-side local database structure
          const mergedDb: LocalDb = {
            users: result.users,
            leads: result.leads
          };
          saveLocalDb(mergedDb);

          // Update cache keys for subscriptions
          localStorage.setItem('lead_ctv_users_cache', JSON.stringify(result.users));
          localStorage.setItem('lead_ctv_leads_cache', JSON.stringify(result.leads));
          
          console.log('[Sync] Database synchronized successfully with server.');
        }
      }
    } catch (err) {
      console.warn('[Sync] Silent database sync failed (server offline or starting up):', err);
    }
  },

  // Subscribe to Users list (Realtime Polling)
  subscribeUsers: (callback: (users: UserProfile[]) => void) => {
    userListeners.push(callback);

    const cached = localStorage.getItem('lead_ctv_users_cache');
    if (cached) {
      try {
        callback(JSON.parse(cached));
      } catch (e) {}
    } else {
      const localUsers = getLocalDb().users || [];
      callback(localUsers);
    }

    const fetchUsers = async () => {
      try {
        const res = await apiFetch('/api/users');
        if (res.ok) {
          const users = await res.json() as UserProfile[];
          localStorage.setItem('lead_ctv_users_cache', JSON.stringify(users));
          notifyUserListeners(users);
          return;
        }
      } catch (err) {
        // ignore to retain previous state/cache
      }
    };

    fetchUsers();
    const interval = setInterval(fetchUsers, 2000);
    return () => {
      userListeners = userListeners.filter((cb) => cb !== callback);
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
        // Update locally
        const dbData = getLocalDb();
        const user = dbData.users.find((u: any) => u.uid === uid);
        if (user) {
          user.isApproved = true;
          saveLocalDb(dbData);
        }
        dbService.syncDatabase().catch(() => {});
        return;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể phê duyệt CTV.');
    } catch (err) {
      // Local fallback
      try {
        const dbData = getLocalDb();
        const user = dbData.users.find((u: any) => u.uid === uid);
        if (user) {
          user.isApproved = true;
          saveLocalDb(dbData);
          dbService.syncDatabase().catch(() => {});
          return;
        }
      } catch (localErr) {}

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
        // Update locally
        const dbData = getLocalDb();
        dbData.users = dbData.users.filter((u: any) => u.uid !== uid);
        saveLocalDb(dbData);
        dbService.syncDatabase().catch(() => {});
        return;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể từ chối CTV.');
    } catch (err) {
      // Local fallback
      try {
        const dbData = getLocalDb();
        dbData.users = dbData.users.filter((u: any) => u.uid !== uid);
        saveLocalDb(dbData);
        dbService.syncDatabase().catch(() => {});
        return;
      } catch (localErr) {}

      if (err instanceof Error && err.message === 'ROUTE_NOT_FOUND_OR_UNREACHABLE') {
        throw new Error('Hệ thống đang khởi động lại hoặc đồng bộ hóa dữ liệu. Vui lòng đợi 2-3 giây rồi thử lại nhé!');
      }
      throw err;
    }
  },

  // Subscribe to Leads (Realtime Polling)
  subscribeLeads: (callback: (leads: Lead[]) => void) => {
    leadListeners.push(callback);

    const cached = localStorage.getItem('lead_ctv_leads_cache');
    if (cached) {
      try {
        callback(JSON.parse(cached));
      } catch (e) {}
    } else {
      const localLeads = getLocalDb().leads || [];
      callback(localLeads);
    }

    const fetchLeads = async () => {
      try {
        const res = await apiFetch('/api/leads');
        if (res.ok) {
          const leads = await res.json() as Lead[];
          localStorage.setItem('lead_ctv_leads_cache', JSON.stringify(leads));
          notifyLeadListeners(leads);
          return;
        }
      } catch (err) {
        // ignore to retain previous state/cache
      }
    };

    fetchLeads();
    const interval = setInterval(fetchLeads, 2000);
    return () => {
      leadListeners = leadListeners.filter((cb) => cb !== callback);
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
        const lead = await res.json() as Lead;
        const dbData = getLocalDb();
        dbData.leads = dbData.leads || [];
        if (!dbData.leads.some((l: any) => l.id === lead.id)) {
          dbData.leads.push(lead);
          saveLocalDb(dbData);
        }

        // Update cache instantly and notify listeners!
        const cached = localStorage.getItem('lead_ctv_leads_cache');
        let currentLeads: Lead[] = [];
        if (cached) {
          try { currentLeads = JSON.parse(cached); } catch (e) {}
        }
        if (!currentLeads.some((l) => l.id === lead.id)) {
          currentLeads = [lead, ...currentLeads];
          localStorage.setItem('lead_ctv_leads_cache', JSON.stringify(currentLeads));
          notifyLeadListeners(currentLeads);
        }

        dbService.syncDatabase().catch(() => {});
        return lead;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể gửi khách hàng lên hệ thống.');
    } catch (err) {
      // Local fallback in case of network/server failure
      try {
        const dbData = getLocalDb();
        const leadId = 'lead_' + Math.random().toString(36).substr(2, 9);
        const localLead: Lead = {
          id: leadId,
          ctvId: ctvUser.uid,
          ctvZaloName: ctvUser.zaloName,
          ctvReferralCode: ctvUser.referralCode,
          parentCtvId: null, // can be resolved on server sync
          customerName,
          customerPhone,
          note: note || '',
          status: 'chua_check',
          isPaidCommission: false,
          commissionAmount: 0,
          parentCommissionAmount: 0,
          createdAt: new Date().toISOString(),
        };
        dbData.leads = dbData.leads || [];
        dbData.leads.push(localLead);
        saveLocalDb(dbData);

        // Update cache and notify
        const cached = localStorage.getItem('lead_ctv_leads_cache');
        let currentLeads: Lead[] = [];
        if (cached) {
          try { currentLeads = JSON.parse(cached); } catch (e) {}
        }
        if (!currentLeads.some((l) => l.id === localLead.id)) {
          currentLeads = [localLead, ...currentLeads];
          localStorage.setItem('lead_ctv_leads_cache', JSON.stringify(currentLeads));
          notifyLeadListeners(currentLeads);
        }

        dbService.syncDatabase().catch(() => {});
        return localLead;
      } catch (localErr) {
        // ignore
      }

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
        // Update locally
        const dbData = getLocalDb();
        dbData.leads = dbData.leads || [];
        const idx = dbData.leads.findIndex((l: any) => l.id === leadId);
        if (idx !== -1) {
          dbData.leads[idx] = { ...dbData.leads[idx], ...updates };
          saveLocalDb(dbData);
        }

        // Update cached leads and notify
        const cachedStr = localStorage.getItem('lead_ctv_leads_cache');
        if (cachedStr) {
          try {
            const currentLeads: Lead[] = JSON.parse(cachedStr);
            const cachedIdx = currentLeads.findIndex((l) => l.id === leadId);
            if (cachedIdx !== -1) {
              currentLeads[cachedIdx] = { ...currentLeads[cachedIdx], ...updates };
              localStorage.setItem('lead_ctv_leads_cache', JSON.stringify(currentLeads));
              notifyLeadListeners(currentLeads);
            }
          } catch (e) {}
        }

        dbService.syncDatabase().catch(() => {});
        return;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Không thể cập nhật thông tin khách hàng.');
    } catch (err) {
      // Local fallback in case of network/server failure
      try {
        const dbData = getLocalDb();
        dbData.leads = dbData.leads || [];
        const idx = dbData.leads.findIndex((l: any) => l.id === leadId);
        if (idx !== -1) {
          dbData.leads[idx] = { ...dbData.leads[idx], ...updates };
          saveLocalDb(dbData);

          // Update cached leads and notify
          const cachedStr = localStorage.getItem('lead_ctv_leads_cache');
          if (cachedStr) {
            try {
              const currentLeads: Lead[] = JSON.parse(cachedStr);
              const cachedIdx = currentLeads.findIndex((l) => l.id === leadId);
              if (cachedIdx !== -1) {
                currentLeads[cachedIdx] = { ...currentLeads[cachedIdx], ...updates };
                localStorage.setItem('lead_ctv_leads_cache', JSON.stringify(currentLeads));
                notifyLeadListeners(currentLeads);
              }
            } catch (e) {}
          }

          dbService.syncDatabase().catch(() => {});
          return;
        }
      } catch (localErr) {
        // ignore
      }

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
    
    const listenerItem = { ctvId, callback, fetchStats };
    statsListeners.push(listenerItem);

    const interval = setInterval(fetchStats, 2000);
    return () => {
      statsListeners = statsListeners.filter((item) => item !== listenerItem);
      clearInterval(interval);
    };
  },
};
