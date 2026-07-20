import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'db.json');
const LOG_FILE = path.join(process.cwd(), 'server.log');

app.use(express.json());

// Log Message Helper
function logMessage(msg: string) {
  const timestamp = new Date().toISOString();
  try {
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`, 'utf8');
    console.log(`[HManager Log] [${timestamp}] ${msg}`);
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

// Request Logging Middleware
app.use((req, res, next) => {
  if (!req.url.startsWith('/@') && !req.url.startsWith('/src') && !req.url.startsWith('/node_modules')) {
    logMessage(`REQ: ${req.method} ${req.url} - Body: ${JSON.stringify(req.body)}`);
  }
  next();
});

// Initialize and Read Database
function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
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
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const content = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading db file, resetting:', error);
    return { users: [], leads: [] };
  }
}

// Write Database
function writeDb(data: any) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing db file:', error);
  }
}

// Ensure database file is generated on start
readDb();

// --- API ROUTES ---

// 1. Sign Up CTV
app.post('/api/auth/signup', (req, res) => {
  try {
    const { email, password, zaloName, referredByCode } = req.body;
    if (!email || !password || !zaloName) {
      logMessage(`Signup failed: Missing required fields.`);
      return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin.' });
    }

    const cleanReferredCode = referredByCode?.trim() || null;
    const dbData = readDb();

    // Verify email uniqueness
    if (dbData.users.some((u: any) => u.email === email.toLowerCase())) {
      logMessage(`Signup failed: Email already registered: ${email}`);
      return res.status(400).json({ message: 'Email đã được đăng ký trong hệ thống!' });
    }

    // Verify referral code if provided
    let parentCtv = null;
    if (cleanReferredCode) {
      parentCtv = dbData.users.find((u: any) => u.referralCode === cleanReferredCode);
      if (!parentCtv) {
        logMessage(`Signup failed: Invalid referral code: ${cleanReferredCode}`);
        return res.status(400).json({ message: 'Mã giới thiệu không tồn tại trong hệ thống. Vui lòng kiểm tra lại!' });
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

    const isAdminAccount = email.toLowerCase() === 'clone1phobo@gmail.com';
    const role = isAdminAccount ? 'admin' : 'ctv';
    const isApproved = isAdminAccount ? true : false;
    const uid = 'user_' + Math.random().toString(36).substr(2, 9);

    const newUser = {
      uid,
      email: email.toLowerCase(),
      password,
      zaloName,
      role,
      isApproved,
      referralCode,
      referredByCode: cleanReferredCode,
      createdAt: new Date().toISOString(),
    };

    dbData.users.push(newUser);
    writeDb(dbData);

    logMessage(`Signup success: ${email} (UID: ${uid}, Role: ${role})`);
    const { password: _, ...profile } = newUser;
    res.json(profile);
  } catch (error: any) {
    logMessage(`CRITICAL error in signup: ${error.stack || error.message}`);
    res.status(500).json({ message: `Lỗi máy chủ: ${error.message}` });
  }
});

// 2. Sign In CTV / Admin
app.post('/api/auth/signin', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập email và mật khẩu.' });
    }

    const normalizedEmail = email.toLowerCase();
    const isAdminAccount = normalizedEmail === 'clone1phobo@gmail.com';
    const dbData = readDb();

    let user = dbData.users.find((u: any) => u.email === normalizedEmail);

    if (!user) {
      // Auto-seed admin user if they are logging in for the first time
      if (isAdminAccount && password === 'nguyen2000') {
        const referralCode = '123456';
        const uid = 'admin_default_uid';
        user = {
          uid,
          email: normalizedEmail,
          password,
          zaloName: 'Lê Đức Nguyên',
          role: 'admin',
          isApproved: true,
          referralCode,
          referredByCode: null,
          createdAt: new Date().toISOString(),
        };
        dbData.users.push(user);
        writeDb(dbData);
        logMessage(`Admin auto-seeded and logged in: ${normalizedEmail}`);
      } else {
        logMessage(`Signin failed: User not found: ${normalizedEmail}`);
        return res.status(400).json({ message: 'Tài khoản không tồn tại hoặc sai thông tin.' });
      }
    }

    if (user.password !== password) {
      logMessage(`Signin failed: Incorrect password for ${normalizedEmail}`);
      return res.status(400).json({ message: 'Mật khẩu không chính xác.' });
    }

    if (!user.isApproved && user.role !== 'admin') {
      logMessage(`Signin failed: Pending approval for ${normalizedEmail}`);
      return res.status(403).json({ message: 'Tài khoản của bạn đang chờ Admin xét duyệt. Vui lòng quay lại sau!' });
    }

    logMessage(`Signin success: ${normalizedEmail} (Role: ${user.role})`);
    const { password: _, ...profile } = user;
    res.json(profile);
  } catch (error: any) {
    logMessage(`CRITICAL error in signin: ${error.stack || error.message}`);
    res.status(500).json({ message: `Lỗi máy chủ: ${error.message}` });
  }
});

// 3. Get User Profile by UID (for auth state watching)
app.get('/api/users/profile', (req, res) => {
  const uid = req.query.uid as string;
  if (!uid) {
    return res.status(400).json({ message: 'Missing uid' });
  }
  const dbData = readDb();
  const user = dbData.users.find((u: any) => u.uid === uid);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  const { password: _, ...profile } = user;
  res.json(profile);
});

// 4. Get All Users (for Admin)
app.get('/api/users', (req, res) => {
  const dbData = readDb();
  const cleanUsers = dbData.users.map(({ password: _, ...u }: any) => u);
  // Sort by createdAt desc
  const sorted = [...cleanUsers].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(sorted);
});

// 5. Approve User
app.post('/api/users/approve', (req, res) => {
  const { uid } = req.body;
  if (!uid) {
    return res.status(400).json({ message: 'Missing uid' });
  }
  const dbData = readDb();
  const user = dbData.users.find((u: any) => u.uid === uid);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  user.isApproved = true;
  writeDb(dbData);
  res.json({ success: true });
});

// 6. Get All Leads
app.get('/api/leads', (req, res) => {
  const dbData = readDb();
  const leads = dbData.leads || [];
  // Sort by createdAt desc
  const sorted = [...leads].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(sorted);
});

// 7. Add Lead
app.post('/api/leads', (req, res) => {
  const { customerName, customerPhone, note, ctvUser } = req.body;
  if (!customerName || !customerPhone || !ctvUser) {
    return res.status(400).json({ message: 'Missing required lead details' });
  }

  const dbData = readDb();
  let parentCtvId = null;

  if (ctvUser.referredByCode) {
    const parentProfile = dbData.users.find((u: any) => u.referralCode === ctvUser.referredByCode);
    if (parentProfile) {
      parentCtvId = parentProfile.uid;
    }
  }

  const leadId = 'lead_' + Math.random().toString(36).substr(2, 9);
  const newLead = {
    id: leadId,
    ctvId: ctvUser.uid,
    ctvZaloName: ctvUser.zaloName,
    ctvReferralCode: ctvUser.referralCode,
    parentCtvId,
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
  dbData.leads.push(newLead);
  writeDb(dbData);

  res.json(newLead);
});

// 8. Update Lead
app.put('/api/leads/:id', (req, res) => {
  const leadId = req.params.id;
  const updates = req.body;
  if (!leadId) {
    return res.status(400).json({ message: 'Missing lead id' });
  }

  const dbData = readDb();
  dbData.leads = dbData.leads || [];
  const leadIndex = dbData.leads.findIndex((l: any) => l.id === leadId);
  if (leadIndex === -1) {
    return res.status(404).json({ message: 'Lead not found' });
  }

  dbData.leads[leadIndex] = {
    ...dbData.leads[leadIndex],
    ...updates,
  };

  writeDb(dbData);
  res.json({ success: true });
});

// 9. Get CTV Stats
app.get('/api/stats', (req, res) => {
  const ctvId = req.query.ctvId as string;
  if (!ctvId) {
    return res.status(400).json({ message: 'Missing ctvId' });
  }

  const dbData = readDb();
  const leads = dbData.leads || [];

  // Find direct leads that are closed ("chot_don")
  const directLeads = leads.filter((l: any) => l.ctvId === ctvId);
  const directSalesCount = directLeads.filter((l: any) => l.status === 'chot_don').length;

  // Find F1 leads (where parentCtvId === ctvId) that are closed
  const f1Leads = leads.filter((l: any) => l.parentCtvId === ctvId);
  const f1SalesCount = f1Leads.filter((l: any) => l.status === 'chot_don').length;

  // Direct commission
  const directCommission = directLeads
    .filter((l: any) => l.status === 'chot_don')
    .reduce((sum: number, l: any) => sum + (l.commissionAmount || 0), 0);

  // Indirect parent commission
  const parentCommission = f1Leads
    .filter((l: any) => l.status === 'chot_don')
    .reduce((sum: number, l: any) => sum + (l.parentCommissionAmount || 0), 0);

  // Total Paid & Pending
  let totalCommissionPaid = 0;
  let totalCommissionPending = 0;

  // For direct leads
  directLeads.filter((l: any) => l.status === 'chot_don').forEach((l: any) => {
    if (l.isPaidCommission) {
      totalCommissionPaid += l.commissionAmount || 0;
    } else {
      totalCommissionPending += l.commissionAmount || 0;
    }
  });

  // For indirect leads (where current CTV is the parent)
  f1Leads.filter((l: any) => l.status === 'chot_don').forEach((l: any) => {
    if (l.isPaidCommission) {
      totalCommissionPaid += l.parentCommissionAmount || 0;
    } else {
      totalCommissionPending += l.parentCommissionAmount || 0;
    }
  });

  res.json({
    directSalesCount,
    f1SalesCount,
    directCommission,
    parentCommission,
    totalCommissionPaid,
    totalCommissionPending,
  });
});

// --- VITE MIDDLEWARE SETUP ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[HManager Server] running on http://localhost:${PORT}`);
  });
}

startServer();
