/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, auth, isUsingRealFirebase } from '../lib/firebase';
import { UserProfile, Lead, LeadStatus, CTVStats } from '../types';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from 'firebase/firestore';

// --- MOCK STORAGE KEYS & PUB-SUB ENGINE ---
const STORAGE_USERS_KEY = 'ctv_lead_users';
const STORAGE_LEADS_KEY = 'ctv_lead_leads';
const STORAGE_CURRENT_USER_KEY = 'ctv_lead_current_user';

type SubCallback = () => void;
const subscribers = new Set<SubCallback>();

function notifySubscribers() {
  subscribers.forEach((cb) => cb());
}

// Listen to other tabs' changes
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_USERS_KEY || e.key === STORAGE_LEADS_KEY || e.key === STORAGE_CURRENT_USER_KEY) {
      notifySubscribers();
    }
  });
}

// --- SEED DEFAULT ADMIN & USERS IF EMPTY IN LOCAL STORAGE ---
const DEFAULT_ADMIN: UserProfile = {
  uid: 'admin_default_uid',
  email: 'clone1phobo@gmail.com',
  zaloName: 'Lê Đức Nguyên',
  role: 'admin',
  isApproved: true,
  referralCode: '123456',
  referredByCode: null,
  createdAt: new Date().toISOString(),
};

function getMockUsers(): UserProfile[] {
  const data = localStorage.getItem(STORAGE_USERS_KEY);
  if (!data) {
    const list = [DEFAULT_ADMIN];
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(list));
    return list;
  }
  const parsed = JSON.parse(data) as UserProfile[];
  // Ensure default admin exists
  if (!parsed.some((u) => u.email === DEFAULT_ADMIN.email)) {
    parsed.push(DEFAULT_ADMIN);
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(parsed));
  }
  return parsed;
}

function saveMockUsers(users: UserProfile[]) {
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
  notifySubscribers();
}

function getMockLeads(): Lead[] {
  const data = localStorage.getItem(STORAGE_LEADS_KEY);
  if (!data) {
    return [];
  }
  return JSON.parse(data) as Lead[];
}

function saveMockLeads(leads: Lead[]) {
  localStorage.setItem(STORAGE_LEADS_KEY, JSON.stringify(leads));
  notifySubscribers();
}

// Generate unique 6-digit referral code
async function generateUniqueReferralCode(): Promise<string> {
  const generate = () => Math.floor(100000 + Math.random() * 900000).toString();
  let code = generate();
  let attempts = 0;

  if (isUsingRealFirebase && db) {
    while (attempts < 20) {
      const q = query(collection(db, 'users'), where('referralCode', '==', code));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        return code;
      }
      code = generate();
      attempts++;
    }
  } else {
    const users = getMockUsers();
    while (attempts < 20) {
      if (!users.some((u) => u.referralCode === code)) {
        return code;
      }
      code = generate();
      attempts++;
    }
  }
  return code;
}

// Check if referral code exists and get user info
async function getUserByReferralCode(code: string): Promise<UserProfile | null> {
  if (isUsingRealFirebase && db) {
    const q = query(collection(db, 'users'), where('referralCode', '==', code));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      return { uid: docSnap.id, ...docSnap.data() } as UserProfile;
    }
    return null;
  } else {
    const users = getMockUsers();
    return users.find((u) => u.referralCode === code) || null;
  }
}

// --- AUTH SERVICE ---
export const authService = {
  // Sign up CTV
  signUp: async (email: string, password: string, zaloName: string, referredByCodeInput: string | null): Promise<UserProfile> => {
    const cleanReferredCode = referredByCodeInput?.trim() || null;

    // 1. If code was entered, verify it exists
    let parentCtv: UserProfile | null = null;
    if (cleanReferredCode) {
      parentCtv = await getUserByReferralCode(cleanReferredCode);
      if (!parentCtv) {
        throw new Error('Mã giới thiệu không tồn tại trong hệ thống. Vui lòng kiểm tra lại!');
      }
    }

    // 2. Generate referral code
    const referralCode = await generateUniqueReferralCode();

    // 3. Determine role and isApproved
    const isAdminAccount = email.toLowerCase() === 'clone1phobo@gmail.com';
    const role = isAdminAccount ? 'admin' : 'ctv';
    const isApproved = isAdminAccount ? true : false;

    if (isUsingRealFirebase && auth && db) {
      // Real Firebase Register
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      const userProfile: UserProfile = {
        uid,
        email: email.toLowerCase(),
        zaloName,
        role,
        isApproved,
        referralCode,
        referredByCode: cleanReferredCode,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', uid), userProfile);
      return userProfile;
    } else {
      // Mock Register
      const users = getMockUsers();
      if (users.some((u) => u.email === email.toLowerCase())) {
        throw new Error('Email đã được đăng ký trong hệ thống!');
      }

      const uid = 'mock_uid_' + Math.random().toString(36).substr(2, 9);
      const userProfile: UserProfile = {
        uid,
        email: email.toLowerCase(),
        zaloName,
        role,
        isApproved,
        referralCode,
        referredByCode: cleanReferredCode,
        createdAt: new Date().toISOString(),
      };

      users.push(userProfile);
      saveMockUsers(users);

      return userProfile;
    }
  },

  // Sign in
  signIn: async (email: string, password: string): Promise<UserProfile> => {
    const normalizedEmail = email.toLowerCase();
    const isAdminAccount = normalizedEmail === 'clone1phobo@gmail.com';

    if (isUsingRealFirebase && auth && db) {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        // Fetch profile
        let userDoc = await getDoc(doc(db, 'users', uid));

        // Auto-seed admin user in Firestore if not present
        if (!userDoc.exists() && isAdminAccount) {
          const adminProfile: UserProfile = {
            uid,
            email: normalizedEmail,
            zaloName: 'Lê Đức Nguyên',
            role: 'admin',
            isApproved: true,
            referralCode: '123456',
            referredByCode: null,
            createdAt: new Date().toISOString(),
          };
          await setDoc(doc(db, 'users', uid), adminProfile);
          return adminProfile;
        }

        if (!userDoc.exists()) {
          throw new Error('Tài khoản không tồn tại trên dữ liệu hệ thống.');
        }

        const profile = userDoc.data() as UserProfile;
        if (!profile.isApproved && profile.role !== 'admin') {
          await fbSignOut(auth);
          throw new Error('Tài khoản của bạn đang chờ Admin xét duyệt. Vui lòng quay lại sau!');
        }

        return profile;
      } catch (error: any) {
        // Handle auto-registration of default admin if they don't exist yet in Firebase Auth
        if (isAdminAccount && (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential')) {
          try {
            // Try to create the admin account
            const profile = await authService.signUp(email, password, 'Lê Đức Nguyên', null);
            return profile;
          } catch (signUpError) {
            throw error; // If that fails, throw original login error
          }
        }
        throw error;
      }
    } else {
      // Mock Sign In
      const users = getMockUsers();
      const foundUser = users.find((u) => u.email === normalizedEmail);

      if (!foundUser) {
        // Auto-register admin if logging in with standard credentials
        if (isAdminAccount && password === 'nguyen2000') {
          const profile = await authService.signUp(email, password, 'Lê Đức Nguyên', null);
          localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(profile));
          notifySubscribers();
          return profile;
        }
        throw new Error('Tài khoản không tồn tại hoặc sai thông tin.');
      }

      // Quick password mock bypass for demo (just compare or accept since it's mock)
      if (isAdminAccount && password !== 'nguyen2000') {
        throw new Error('Sai mật khẩu đăng nhập Admin!');
      }

      if (!foundUser.isApproved) {
        throw new Error('Tài khoản của bạn đang chờ Admin xét duyệt. Vui lòng quay lại sau!');
      }

      localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(foundUser));
      notifySubscribers();
      return foundUser;
    }
  },

  // Sign out
  signOut: async (): Promise<void> => {
    if (isUsingRealFirebase && auth) {
      await fbSignOut(auth);
    } else {
      localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
      notifySubscribers();
    }
  },

  // Watch Auth State
  onAuthStateChanged: (callback: (user: UserProfile | null) => void) => {
    if (isUsingRealFirebase && auth && db) {
      return fbOnAuthStateChanged(auth, async (fbUser) => {
        if (!fbUser) {
          callback(null);
          return;
        }
        try {
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            callback(userDoc.data() as UserProfile);
          } else {
            callback(null);
          }
        } catch (err) {
          callback(null);
        }
      });
    } else {
      const checkAuth = () => {
        const stored = localStorage.getItem(STORAGE_CURRENT_USER_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as UserProfile;
          // Sync changes to the current user (e.g. if approved in another tab or mock)
          const users = getMockUsers();
          const fresh = users.find((u) => u.uid === parsed.uid);
          callback(fresh || null);
        } else {
          callback(null);
        }
      };

      // Initial check
      checkAuth();

      // Subscribe to storage / local state updates
      subscribers.add(checkAuth);
      return () => {
        subscribers.delete(checkAuth);
      };
    }
  },
};

// --- DATA SERVICE ---
export const dbService = {
  // Subscribe to Users list (Realtime)
  subscribeUsers: (callback: (users: UserProfile[]) => void) => {
    if (isUsingRealFirebase && db) {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      return onSnapshot(q, (snapshot) => {
        const users: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          users.push(docSnap.data() as UserProfile);
        });
        callback(users);
      });
    } else {
      const sendUsers = () => {
        const users = getMockUsers();
        // Sort by createdAt desc
        const sorted = [...users].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(sorted);
      };

      sendUsers();
      subscribers.add(sendUsers);
      return () => {
        subscribers.delete(sendUsers);
      };
    }
  },

  // Approve a CTV account
  approveUser: async (uid: string): Promise<void> => {
    if (isUsingRealFirebase && db) {
      await updateDoc(doc(db, 'users', uid), { isApproved: true });
    } else {
      const users = getMockUsers();
      const updated = users.map((u) => (u.uid === uid ? { ...u, isApproved: true } : u));
      saveMockUsers(updated);
    }
  },

  // Subscribe to Leads (Realtime)
  subscribeLeads: (callback: (leads: Lead[]) => void) => {
    if (isUsingRealFirebase && db) {
      const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
      return onSnapshot(q, (snapshot) => {
        const leads: Lead[] = [];
        snapshot.forEach((docSnap) => {
          leads.push({ id: docSnap.id, ...docSnap.data() } as Lead);
        });
        callback(leads);
      });
    } else {
      const sendLeads = () => {
        const leads = getMockLeads();
        const sorted = [...leads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(sorted);
      };

      sendLeads();
      subscribers.add(sendLeads);
      return () => {
        subscribers.delete(sendLeads);
      };
    }
  },

  // Add a new Lead
  addLead: async (customerName: string, customerPhone: string, note: string, ctvUser: UserProfile): Promise<Lead> => {
    let parentCtvId: string | null = null;

    // Find parent CTV UID if there is referredByCode
    if (ctvUser.referredByCode) {
      const parentProfile = await getUserByReferralCode(ctvUser.referredByCode);
      if (parentProfile) {
        parentCtvId = parentProfile.uid;
      }
    }

    const leadId = isUsingRealFirebase ? doc(collection(db!, 'leads')).id : 'lead_mock_' + Math.random().toString(36).substr(2, 9);

    const newLead: Lead = {
      id: leadId,
      ctvId: ctvUser.uid,
      ctvZaloName: ctvUser.zaloName,
      ctvReferralCode: ctvUser.referralCode,
      parentCtvId,
      customerName,
      customerPhone,
      note,
      status: 'chua_check',
      isPaidCommission: false,
      commissionAmount: 0,
      parentCommissionAmount: 0,
      createdAt: new Date().toISOString(),
    };

    if (isUsingRealFirebase && db) {
      await setDoc(doc(db, 'leads', leadId), newLead);
    } else {
      const leads = getMockLeads();
      leads.push(newLead);
      saveMockLeads(leads);
    }

    return newLead;
  },

  // Update a Lead (Status, commission amount, paid status)
  updateLead: async (leadId: string, updates: Partial<Lead>): Promise<void> => {
    if (isUsingRealFirebase && db) {
      await updateDoc(doc(db, 'leads', leadId), updates);
    } else {
      const leads = getMockLeads();
      const updated = leads.map((l) => (l.id === leadId ? { ...l, ...updates } : l));
      saveMockLeads(updated);
    }
  },

  // Subscribe to statistics for a specific CTV (Realtime calculations)
  subscribeCTVStats: (ctvId: string, callback: (stats: CTVStats) => void) => {
    const computeStats = (leads: Lead[], users: UserProfile[]): CTVStats => {
      // Find direct leads that are closed ("chot_don")
      const directLeads = leads.filter((l) => l.ctvId === ctvId);
      const directSalesCount = directLeads.filter((l) => l.status === 'chot_don').length;

      // Find F1 leads (where parentCtvId === ctvId) that are closed
      const f1Leads = leads.filter((l) => l.parentCtvId === ctvId);
      const f1SalesCount = f1Leads.filter((l) => l.status === 'chot_don').length;

      // Direct commission
      const directCommission = directLeads
        .filter((l) => l.status === 'chot_don')
        .reduce((sum, l) => sum + (l.commissionAmount || 0), 0);

      // Indirect parent commission
      const parentCommission = f1Leads
        .filter((l) => l.status === 'chot_don')
        .reduce((sum, l) => sum + (l.parentCommissionAmount || 0), 0);

      // Total Paid & Pending
      let totalCommissionPaid = 0;
      let totalCommissionPending = 0;

      // For direct leads
      directLeads.filter((l) => l.status === 'chot_don').forEach((l) => {
        if (l.isPaidCommission) {
          totalCommissionPaid += l.commissionAmount || 0;
        } else {
          totalCommissionPending += l.commissionAmount || 0;
        }
      });

      // For indirect leads (where current CTV is the parent, so they get the parentCommissionAmount)
      f1Leads.filter((l) => l.status === 'chot_don').forEach((l) => {
        if (l.isPaidCommission) {
          totalCommissionPaid += l.parentCommissionAmount || 0;
        } else {
          totalCommissionPending += l.parentCommissionAmount || 0;
        }
      });

      return {
        directSalesCount,
        f1SalesCount,
        directCommission,
        parentCommission,
        totalCommissionPaid,
        totalCommissionPending,
      };
    };

    if (isUsingRealFirebase && db) {
      // Set up simple composite state listener by listening to leads & users collections
      let currentLeads: Lead[] = [];
      let currentUsers: UserProfile[] = [];

      const triggerCallback = () => {
        callback(computeStats(currentLeads, currentUsers));
      };

      const unsubLeads = onSnapshot(collection(db, 'leads'), (snapshot) => {
        currentLeads = [];
        snapshot.forEach((d) => currentLeads.push(d.data() as Lead));
        triggerCallback();
      });

      const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        currentUsers = [];
        snapshot.forEach((d) => currentUsers.push(d.data() as UserProfile));
        triggerCallback();
      });

      return () => {
        unsubLeads();
        unsubUsers();
      };
    } else {
      const getStats = () => {
        const leads = getMockLeads();
        const users = getMockUsers();
        callback(computeStats(leads, users));
      };

      getStats();
      subscribers.add(getStats);
      return () => {
        subscribers.delete(getStats);
      };
    }
  },
};
