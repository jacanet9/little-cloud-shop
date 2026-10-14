// ==============================================================================
// LITTLE CLOUD SHOP - BACKEND SERVER (Node.js / Express)
// Real Omise PromptPay Charges API + Webhook + Atomic Wallet + Mobile Slip Relay
// ==============================================================================

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase Client
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hwzdowxjxtdhcgiylnbo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_5ZvVjg1viXXX_vli5gdhAA_j4lSg5j4';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Omise Config
const OMISE_SECRET_KEY = process.env.OMISE_SECRET_KEY || '';
const OMISE_PUBLIC_KEY = process.env.OMISE_PUBLIC_KEY || '';

// Universal CORS & Private Network Access Middleware (Supports file://, localhost, LAN IP)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Middlewares - Support large image uploads (up to 50MB base64)
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, './'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// In-memory Mobile Slip Sessions Store
const SLIP_CACHE_FILE = path.join(__dirname, 'latest_slip.json');
const SLIP_SESSIONS = {};

// Load persisted slip cache if exists
try {
  if (fs.existsSync(SLIP_CACHE_FILE)) {
    const raw = fs.readFileSync(SLIP_CACHE_FILE, 'utf-8');
    const cached = JSON.parse(raw);
    if (cached && cached.session_id) {
      SLIP_SESSIONS[cached.session_id] = cached;
      SLIP_SESSIONS['_latest'] = cached;
    }
  }
} catch (e) {
  console.warn('Could not read slip cache file:', e.message);
}

// Clean up expired slip sessions (keep active for at least 2 hours)
setInterval(() => {
  const now = Date.now();
  for (const sid in SLIP_SESSIONS) {
    if (sid === '_latest') continue;
    const sessionTime = SLIP_SESSIONS[sid].uploaded_at || SLIP_SESSIONS[sid].created_at || now;
    if (now - sessionTime > 2 * 60 * 60 * 1000) {
      delete SLIP_SESSIONS[sid];
    }
  }
}, 10 * 60 * 1000);

// Helper: Detect Active LAN IPv4 Address
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(iface.address)) {
          return iface.address;
        }
      }
    }
  }
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Helper: Omise Basic Auth Header
const getOmiseAuthHeader = () => {
  const secretKey = OMISE_SECRET_KEY.trim();
  const token = Buffer.from(secretKey + ':').toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json'
  };
};

// Route: Clean URL for /upload-slip
app.get('/upload-slip', (req, res) => {
  res.sendFile(path.join(__dirname, 'upload-slip.html'));
});

// ==============================================================================
// 1. MOBILE SLIP ENDPOINTS (Real Mobile QR Scan & Upload)
// ==============================================================================

// Create Slip Upload Session
const handleCreateSlipSession = (req, res) => {
  try {
    const sessionId = `slip_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const lanIp = getLanIp();
    const uploadUrl = `http://${lanIp}:${PORT}/upload-slip.html?session=${sessionId}`;
    const localUrl = `http://127.0.0.1:${PORT}/upload-slip.html?session=${sessionId}`;

    SLIP_SESSIONS[sessionId] = {
      session_id: sessionId,
      status: 'waiting',
      slip_data: null,
      filename: null,
      created_at: Date.now()
    };

    console.log(`[Slip Session] Created: ${sessionId}`);
    console.log(`   📱 Mobile QR Upload URL: ${uploadUrl}`);

    return res.status(200).json({
      success: true,
      session_id: sessionId,
      upload_url: uploadUrl,
      local_url: localUrl,
      lan_ip: lanIp,
      port: PORT
    });
  } catch (err) {
    console.error('Slip session create error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

app.post('/api/slip/session/create', handleCreateSlipSession);
app.get('/api/slip/session/create', handleCreateSlipSession);

// Upload Slip from Mobile Phone
app.post('/api/slip/upload', (req, res) => {
  try {
    const { session_id, image_data, filename } = req.body;
    if (!session_id || !image_data) {
      return res.status(400).json({
        success: false,
        message: 'ข้อมูลไม่ครบถ้วน กรุณาระบุ session_id และรูปภาพ'
      });
    }

    const now = Date.now();
    const sessionObj = {
      session_id: session_id,
      status: 'completed',
      slip_data: image_data,
      filename: filename || 'mobile_slip.jpg',
      created_at: (SLIP_SESSIONS[session_id] && SLIP_SESSIONS[session_id].created_at) || now,
      uploaded_at: now
    };

    SLIP_SESSIONS[session_id] = sessionObj;
    SLIP_SESSIONS['_latest'] = sessionObj;

    // Persist to disk for high reliability
    try {
      fs.writeFileSync(SLIP_CACHE_FILE, JSON.stringify(sessionObj), 'utf-8');
    } catch (e) {}

    console.log(`[Slip Uploaded] Session: ${session_id} (${filename || 'mobile_slip.jpg'}, ${(image_data.length / 1024).toFixed(1)} KB)`);
    return res.status(200).json({
      success: true,
      message: 'อัพโหลดสลิปเรียบร้อยแล้ว'
    });
  } catch (err) {
    console.error('Slip upload error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Health Check Endpoint
app.get('/api/health', (req, res) => res.json({ status: 'ok', server: 'little-cloud', time: Date.now() }));
app.get('/api/slip/health', (req, res) => res.json({ status: 'ok', server: 'little-cloud', time: Date.now() }));

// Check Slip Upload Status (PC Polling)
app.get('/api/slip/check/:session_id', (req, res) => {
  const { session_id } = req.params;
  const session = SLIP_SESSIONS[session_id];

  // BUG FIX: Do NOT auto-create sessions for unknown IDs (prevents old session replay)
  if (!session) {
    return res.status(200).json({
      success: true,
      status: 'waiting',
      message: 'Waiting for mobile upload'
    });
  }

  // If session is still waiting, strictly return waiting (DO NOT return older slip!)
  if (session.status !== 'completed' || !session.slip_data) {
    return res.status(200).json({
      success: true,
      status: 'waiting',
      message: 'Waiting for mobile upload'
    });
  }

  // BUG FIX: Expire completed sessions older than 30 minutes to prevent stale slip reuse
  const sessionAge = Date.now() - (session.uploaded_at || session.created_at || 0);
  if (sessionAge > 30 * 60 * 1000) {
    return res.status(200).json({
      success: true,
      status: 'waiting',
      message: 'Session expired'
    });
  }

  // Session has completed its own upload!
  console.log(`[Slip Check] Session ${session_id} is COMPLETED (${session.filename}, ${(session.slip_data.length / 1024).toFixed(1)} KB)`);

  return res.status(200).json({
    success: true,
    status: 'completed',
    slip_data: session.slip_data,
    filename: session.filename
  });
});

// Latest Slip Endpoint (For manual pull button)
app.get('/api/slip/latest', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  let latest = SLIP_SESSIONS['_latest'];
  if ((!latest || !latest.slip_data) && fs.existsSync(SLIP_CACHE_FILE)) {
    try {
      latest = JSON.parse(fs.readFileSync(SLIP_CACHE_FILE, 'utf-8'));
      if (latest && latest.slip_data) {
        SLIP_SESSIONS['_latest'] = latest;
        if (latest.session_id) SLIP_SESSIONS[latest.session_id] = latest;
      }
    } catch (e) {}
  }

  // BUG FIX: Expire cached slips older than 30 minutes to prevent stale slip reuse
  if (latest && latest.slip_data) {
    const slipAge = Date.now() - (latest.uploaded_at || latest.created_at || 0);
    if (slipAge > 30 * 60 * 1000) {
      return res.status(404).json({
        success: false,
        message: 'สลิปล่าสุดหมดอายุแล้ว (เกิน 30 นาที) กรุณาอัพโหลดสลิปใหม่'
      });
    }
    return res.status(200).json({
      success: true,
      status: 'completed',
      session_id: latest.session_id || 'latest',
      slip_data: latest.slip_data,
      filename: latest.filename || 'mobile_slip.jpg',
      uploaded_at: latest.uploaded_at || Date.now()
    });
  }

  return res.status(404).json({
    success: false,
    message: 'ยังไม่มีสลิปที่อัพโหลดล่าสุด'
  });
});

// Server-side QR Inspector endpoint (Fallback for tricky images)
app.post('/api/slip/inspect', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const { image_data } = req.body;
    if (!image_data) {
      return res.status(400).json({ success: false, message: 'Missing image_data' });
    }

    const base64Data = image_data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    let rawImageData = null;
    try {
      const jpeg = require('jpeg-js');
      rawImageData = jpeg.decode(buffer, { useTArray: true });
    } catch (jpegErr) {
      console.warn('Server jpeg decode warning:', jpegErr.message);
    }

    if (rawImageData && rawImageData.data) {
      const jsQR = require('jsqr');
      const code = jsQR(rawImageData.data, rawImageData.width, rawImageData.height, {
        inversionAttempts: 'attemptBoth'
      });

      if (code && code.data) {
        return res.status(200).json({
          success: true,
          qrData: code.data
        });
      }
    }

    return res.status(200).json({
      success: false,
      message: 'No QR found via server inspection'
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ==============================================================================
// 1.5 REAL SLIP VERIFICATION & ANTI-FRAUD ENGINE
// SlipOK API (primary) + Anti-Replay Ledger + Per-user Locking + Pending Admin Fallback
// ==============================================================================

const crypto = require('crypto');

const BANK_NAMES = {
  '002': 'ธนาคารกรุงเทพ (BBL)',
  '004': 'ธนาคารกสิกรไทย (K-Bank)',
  '006': 'ธนาคารกรุงไทย (KTB)',
  '011': 'ธนาคารทหารไทยธนชาต (ttb)',
  '014': 'ธนาคารไทยพาณิชย์ (SCB)',
  '022': 'ธนาคารซีไอเอ็มบีไทย (CIMBT)',
  '025': 'ธนาคารกรุงศรีอยุธยา (BAY)',
  '030': 'ธนาคารออมสิน (GSB)',
  '034': 'ธนาคาร ธ.ก.ส. (BAAC)',
  '067': 'ธนาคารทิสโก้ (TISCO)',
  '069': 'ธนาคารเกียรตินาคินภัทร (KKP)',
  '070': 'ธนาคารไอซีบีซี (ไทย)',
  '073': 'ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)'
};

// SlipOK error codes -> how we treat them
// "reject": slip itself is invalid -> tell the customer, never credit
// anything else (config / quota / bank delay / network) -> queue as PENDING for admin review
const SLIPOK_REJECT_CODES = {
  1005: { code: 'INVALID_SLIP', message: '❌ ไฟล์ที่แนบไม่ใช่รูปภาพ กรุณาแนบรูปสลิป (JPG/PNG)' },
  1006: { code: 'INVALID_SLIP', message: '❌ รูปภาพไม่ถูกต้องหรือไม่ชัด กรุณาแนบรูปสลิปที่ชัดเจน' },
  1007: { code: 'INVALID_SLIP', message: '❌ ไม่พบ QR Code บนรูปสลิป กรุณาแนบสลิปตัวเต็มจากแอปธนาคาร (ห้ามครอปตัด QR ออก)' },
  1008: { code: 'INVALID_SLIP', message: '❌ QR Code บนรูปนี้ไม่ใช่สลิปโอนเงิน กรุณาแนบสลิปจากแอปธนาคาร' },
  1011: { code: 'INVALID_SLIP', message: '❌ ไม่พบรายการโอนเงินนี้ในระบบธนาคาร (สลิปปลอม หรือ QR หมดอายุ)' },
  1013: { code: 'AMOUNT_MISMATCH', message: '❌ ยอดเงินในสลิปไม่ตรงกับยอดที่ระบุเติม' },
  1014: { code: 'WRONG_RECEIVER', message: '❌ บัญชีผู้รับในสลิปไม่ใช่บัญชีของร้านค้า กรุณาโอนเข้าพร้อมเพย์ของร้านเท่านั้น' }
};
const SLIPOK_PENDING_REASONS = {
  1000: 'SlipOK: ข้อมูลคำขอไม่ครบ',
  1001: 'SlipOK: ไม่พบ Branch ID',
  1002: 'SlipOK: API Key ไม่ถูกต้อง',
  1003: 'SlipOK: แพ็กเกจหมดอายุ',
  1004: 'SlipOK: โควต้าหมด',
  1009: 'ระบบธนาคารขัดข้องชั่วคราว',
  1010: 'ธนาคารยังไม่อัปเดตข้อมูลสลิป (โอนไม่นาน)'
};

class HttpError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.httpStatus = status;
    this.code = code;
    this.extra = extra || {};
  }
}

// Serialize all balance mutations per-user (prevents lost updates / double credit races)
const userLocks = new Map();
function withUserLock(userId, fn) {
  const prev = userLocks.get(userId) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  userLocks.set(userId, tail);
  tail.then(() => { if (userLocks.get(userId) === tail) userLocks.delete(userId); });
  return run;
}

// Slip refs currently being processed (prevents the same slip racing through twice)
const inFlightRefs = new Set();

const roundMoney = (n) => Math.round(Number(n) * 100) / 100;
const sanitizeRef = (ref) => String(ref || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

function parseTLV(str) {
  const tags = {};
  let i = 0;
  while (i < str.length) {
    const tag = str.substring(i, i + 2);
    if (tag.length < 2 || isNaN(tag)) break;
    i += 2;
    const len = parseInt(str.substring(i, i + 2), 10);
    if (isNaN(len) || len < 0) break;
    i += 2;
    tags[tag] = str.substring(i, i + len);
    i += len;
  }
  return tags;
}

// Extract transaction ref from a Thai bank e-slip mini-QR payload
function parseSlipRefFromPayload(payload) {
  if (!payload) return '';
  const outer = parseTLV(payload);
  if (outer['00']) {
    const inner = parseTLV(outer['00']);
    if (inner['00'] === '000001' && inner['02']) return sanitizeRef(inner['02']);
  }
  return '';
}

function decodeQrFromDataUrl(dataUrl) {
  try {
    if (!/^data:image\/jpe?g;base64,/i.test(dataUrl)) return '';
    const buffer = Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const jpeg = require('jpeg-js');
    const raw = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 1024 });
    const jsQR = require('jsqr');
    const code = jsQR(raw.data, raw.width, raw.height, { inversionAttempts: 'attemptBoth' });
    return code && code.data ? code.data.trim() : '';
  } catch (e) {
    return '';
  }
}

async function getGatewaySettings() {
  const { data } = await supabase.from('site_settings').select('*').limit(1);
  const s = (data && data[0]) || {};
  return {
    apiKey: (s.gateway_api_key || process.env.SLIPOK_API_KEY || '').trim(),
    branchId: (s.gateway_branch_id || process.env.SLIPOK_BRANCH_ID || '').trim().replace(/^.*\/apikey\//i, '').replace(/[^a-zA-Z0-9_-]/g, ''),
    promptpayNum: (s.promptpay_number || '0815993194').replace(/[^0-9]/g, '')
  };
}

// Call SlipOK. Returns { info, error, unavailable }
async function callSlipOk({ branchId, apiKey, slipData, payload, amount }) {
  const FormData = require('form-data');
  const url = `https://api.slipok.com/api/line/apikey/${branchId}`;
  let lastError = null;
  let unavailable = false;

  const handle = (resp) => (resp && resp.data && resp.data.success && resp.data.data) ? resp.data.data : null;
  const onErr = (err, label) => {
    const data = err.response && err.response.data;
    if (data && typeof data === 'object' && data.code) {
      lastError = data;
    } else {
      unavailable = true; // timeout / network / 5xx without SlipOK body
    }
    console.warn(`[SlipOK ${label}]`, data || err.message);
  };

  // Method A: image upload (most accurate)
  if (slipData && /^data:image\//i.test(slipData)) {
    try {
      const imgBuffer = Buffer.from(slipData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const mime = (slipData.match(/^data:(image\/\w+);/i) || [])[1] || 'image/jpeg';
      const form = new FormData();
      form.append('files', imgBuffer, { filename: mime.includes('png') ? 'slip.png' : 'slip.jpg', contentType: mime });
      form.append('amount', String(amount));
      form.append('log', 'true');
      const resp = await axios.post(url, form, { headers: { ...form.getHeaders(), 'x-authorization': apiKey }, timeout: 15000 });
      const info = handle(resp);
      if (info) return { info, error: null, unavailable: false };
    } catch (err) { onErr(err, 'image'); }
  }

  // Method B: QR payload string (only if image did not give a definitive answer)
  if (payload && (!lastError || lastError.code === 1007 || lastError.code === 1006)) {
    try {
      const resp = await axios.post(url, { data: payload, amount, log: true }, {
        headers: { 'x-authorization': apiKey, 'Content-Type': 'application/json' }, timeout: 12000
      });
      const info = handle(resp);
      if (info) return { info, error: null, unavailable: false };
    } catch (err) { onErr(err, 'qr'); }
  }

  // Code 1012 = SlipOK has seen this slip before (e.g. a previous attempt that failed on our side).
  // Its payload still contains the bank-verified slip data. Our own ledger is the source of truth for duplicates.
  if (lastError && lastError.code === 1012 && lastError.data) {
    return { info: lastError.data, error: null, unavailable: false, seenBefore: true };
  }
  return { info: null, error: lastError, unavailable };
}

function extractDigits(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.replace(/[^0-9]/g, '');
  if (typeof v === 'object' && typeof v.value === 'string') return v.value.replace(/[^0-9]/g, '');
  return '';
}

async function findExistingSlipRecords(transRef) {
  const [txnRes, topupRes] = await Promise.all([
    supabase.from('wallet_transactions')
      .select('id, reference_id, user_id, amount, status')
      .or(`reference_id.eq.${transRef},gateway_ref.eq.${transRef},gateway_ref.eq.SLIP-${transRef},gateway_ref.eq.SLIPOK-${transRef}`)
      .limit(1),
    supabase.from('topups')
      .select('id, transaction_ref, user_id, amount, status')
      .or(`transaction_ref.eq.${transRef},gateway_ref.eq.${transRef},gateway_ref.eq.SLIP-${transRef},gateway_ref.eq.SLIPOK-${transRef}`)
      .limit(1)
  ]);
  if (txnRes.error) throw new Error('ตรวจสอบสลิปซ้ำไม่สำเร็จ: ' + txnRes.error.message);
  if (topupRes.error) throw new Error('ตรวจสอบสลิปซ้ำไม่สำเร็จ: ' + topupRes.error.message);
  return { txn: (txnRes.data && txnRes.data[0]) || null, topup: (topupRes.data && topupRes.data[0]) || null };
}

async function getBalance(userId) {
  const { data } = await supabase.from('profiles').select('balance').eq('id', userId).single();
  return data ? Number(data.balance) || 0 : 0;
}

// Credit wallet atomically (per-user lock + ledger-first idempotency)
async function creditWallet({ userId, amount, reference, gatewayRef, description }) {
  return withUserLock(userId, async () => {
    const { data: existing } = await supabase.from('wallet_transactions').select('id').eq('reference_id', reference).limit(1);
    if (existing && existing.length > 0) throw new HttpError(409, 'รายการนี้เติมเงินไปแล้ว', 'ALREADY_CREDITED');

    const { data: profile, error: pErr } = await supabase.from('profiles').select('id, username, balance').eq('id', userId).single();
    if (pErr || !profile) throw new HttpError(404, 'ไม่พบผู้ใช้ในระบบ', 'USER_NOT_FOUND');

    const balBefore = roundMoney(Number(profile.balance) || 0);
    const balAfter = roundMoney(balBefore + amount);

    // 1. Ledger first: reference_id is UNIQUE -> DB rejects any concurrent duplicate
    const { error: lErr } = await supabase.from('wallet_transactions').insert({
      user_id: userId,
      username: profile.username,
      type: 'topup',
      amount,
      balance_before: balBefore,
      balance_after: balAfter,
      reference_id: reference,
      gateway_ref: gatewayRef,
      description,
      status: 'completed'
    });
    if (lErr) {
      if (lErr.code === '23505') throw new HttpError(409, 'รายการนี้เติมเงินไปแล้ว', 'ALREADY_CREDITED');
      throw new Error('บันทึกบัญชีไม่สำเร็จ: ' + lErr.message);
    }

    // 2. Balance update (rollback ledger row on failure)
    const { error: uErr } = await supabase.from('profiles')
      .update({ balance: balAfter, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (uErr) {
      await supabase.from('wallet_transactions').delete().eq('reference_id', reference);
      throw new Error('อัปเดตยอดเงินไม่สำเร็จ: ' + uErr.message);
    }

    return { username: profile.username, balBefore, balAfter };
  });
}

app.post('/api/slip/verify', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  let lockedRef = null;
  try {
    const { user_id, amount, slip_data, qr_data, payload: rawPayload } = req.body || {};
    const requestedAmount = roundMoney(parseFloat(amount));

    // ---- 0. Input validation ----
    if (!user_id || typeof user_id !== 'string') {
      throw new HttpError(400, 'กรุณาเข้าสู่ระบบก่อนทำรายการ', 'BAD_REQUEST');
    }
    if (isNaN(requestedAmount) || requestedAmount < 1 || requestedAmount > 50000) {
      throw new HttpError(400, 'ยอดเงินต้องอยู่ระหว่าง 1 - 50,000 บาท', 'BAD_REQUEST');
    }
    const slipData = (typeof slip_data === 'string' && /^data:image\//i.test(slip_data)) ? slip_data : '';
    let payload = String(rawPayload || qr_data || '').trim();
    if (!slipData && !payload) {
      throw new HttpError(400, 'กรุณาแนบรูปภาพสลิปหลักฐานการโอนเงิน', 'BAD_REQUEST');
    }

    const { data: profile } = await supabase.from('profiles').select('id, username').eq('id', user_id).single();
    if (!profile) throw new HttpError(404, 'ไม่พบผู้ใช้ในระบบ กรุณาเข้าสู่ระบบใหม่', 'USER_NOT_FOUND');

    if (!payload && slipData) payload = decodeQrFromDataUrl(slipData);

    // Customer uploaded the shop's PromptPay *payment* QR instead of their transfer slip
    if (payload.startsWith('000201')) {
      throw new HttpError(400, '❌ รูปนี้คือ QR พร้อมเพย์สำหรับ "จ่ายเงิน" ไม่ใช่สลิปโอนเงิน กรุณาแนบสลิปที่ได้หลังโอนเงินสำเร็จ', 'INVALID_SLIP');
    }

    // ---- 1. Verify with SlipOK ----
    const { apiKey, branchId, promptpayNum } = await getGatewaySettings();
    let slipInfo = null;
    let pendingReason = '';

    if (apiKey && branchId) {
      console.log(`[SlipOK] Verifying slip for ${profile.username} (฿${requestedAmount})...`);
      const result = await callSlipOk({ branchId, apiKey, slipData, payload, amount: requestedAmount });
      if (result.info) {
        slipInfo = result.info;
        if (result.seenBefore) {
          const ref = sanitizeRef(result.info.transRef);
          console.warn(`[SlipOK Guard] SlipOK code 1012 (already seen) detected for ref ${ref}`);
          throw new HttpError(400, `⚠️ สลิปนี้เคยถูกส่งใช้งานไปแล้วในระบบ (ตรวจพบสลิปซ้ำ Ref: ${ref}) ไม่สามารถใช้สลิปเดิมซ้ำได้`, 'DUPLICATE_SLIP', {
            transRef: ref,
            alreadyCredited: true,
            duplicate: true
          });
        }
      } else if (result.error && SLIPOK_REJECT_CODES[result.error.code]) {
        const r = SLIPOK_REJECT_CODES[result.error.code];
        let msg = r.message;
        if (result.error.code === 1013 && result.error.data && result.error.data.amount) {
          msg = `❌ ยอดเงินในสลิป (฿${Number(result.error.data.amount).toFixed(2)}) ไม่ตรงกับยอดที่ระบุเติม (฿${requestedAmount.toFixed(2)}) กรุณาระบุยอดให้ตรงกับสลิป`;
        }
        throw new HttpError(400, msg, r.code);
      } else if (result.error) {
        pendingReason = SLIPOK_PENDING_REASONS[result.error.code] || `SlipOK code ${result.error.code}`;
      } else {
        pendingReason = 'เชื่อมต่อ SlipOK ไม่ได้';
      }
    } else {
      pendingReason = 'ยังไม่ได้ตั้งค่า SlipOK';
    }

    // ---- 2. Validate verified slip data ----
    let transRef = '';
    let verifiedAmount = requestedAmount;
    if (slipInfo) {
      const actualAmount = roundMoney(Number(slipInfo.amount));
      if (!actualAmount || actualAmount <= 0) {
        throw new HttpError(400, '❌ ไม่สามารถอ่านยอดเงินจากสลิปได้ กรุณาแนบสลิปที่ชัดเจน', 'INVALID_SLIP');
      }
      if (Math.abs(actualAmount - requestedAmount) > 0.009) {
        throw new HttpError(400, `❌ ยอดเงินในสลิป (฿${actualAmount.toFixed(2)}) ไม่ตรงกับยอดที่ระบุเติม (฿${requestedAmount.toFixed(2)}) กรุณาระบุยอดให้ตรงกับสลิป`, 'AMOUNT_MISMATCH');
      }

      // Receiver guard: STRICTLY compare PromptPay proxy suffix
      // Protect against slips transferred to bank accounts or third-party accounts
      const rx = slipInfo.receiver || {};
      const proxyDigits = extractDigits(rx.proxy);
      const shopDigits = promptpayNum.replace(/[^0-9]/g, '');
      const shopSuffix6 = shopDigits.slice(-6);
      const shopSuffix4 = shopDigits.slice(-4);

      let isMatch = false;
      if (shopDigits && proxyDigits.length >= 4) {
        if (proxyDigits.length >= 6 && shopSuffix6) {
          isMatch = (proxyDigits.slice(-6) === shopSuffix6);
        } else {
          isMatch = (proxyDigits.slice(-4) === shopSuffix4);
        }
      }

      if (!isMatch) {
        const maskedShop = shopDigits ? `${shopDigits.slice(0, 3)}-xxx-${shopSuffix4}` : 'ร้านค้า';
        throw new HttpError(400, `❌ สลิปนี้ไม่ได้โอนเข้าพร้อมเพย์ของทางร้าน (${maskedShop}) สลิปจ่ายโอนรายการอื่นไม่สามารถใช้เติมเงินได้`, 'WRONG_RECEIVER');
      }

      transRef = sanitizeRef(slipInfo.transRef);
      if (!transRef) throw new HttpError(400, '❌ ไม่พบเลขอ้างอิงธุรกรรมในสลิป', 'INVALID_SLIP');
      verifiedAmount = actualAmount;
    } else {
      // Pending path: need a stable reference so the same slip can't be queued twice
      // Require genuine bank QR payload or valid slip image
      if (!slipData && !payload) {
        throw new HttpError(400, '❌ กรุณาแนบรูปภาพสลิปหรือข้อมูล QR เพื่อดำเนินการต่อ', 'INVALID_SLIP');
      }
      transRef = parseSlipRefFromPayload(payload);
      if (!transRef) {
        if (!slipData) throw new HttpError(400, '❌ ข้อมูล QR ไม่ใช่สลิปโอนเงินของธนาคาร', 'INVALID_SLIP');
        // Use content hash of image as stable ref for unreadable-QR slips
        transRef = 'IMG-' + crypto.createHash('sha256').update(slipData).digest('hex').slice(0, 24);
      }
    }

    // ---- 3. In-flight guard ----
    if (inFlightRefs.has(transRef)) {
      throw new HttpError(409, '⏳ สลิปนี้กำลังถูกตรวจสอบอยู่ กรุณารอสักครู่', 'IN_PROGRESS');
    }
    inFlightRefs.add(transRef);
    lockedRef = transRef;

    // ---- 4. Anti-replay check against our ledger ----
    const existing = await findExistingSlipRecords(transRef);
    if (existing.txn || existing.topup) {
      const owner = (existing.txn || existing.topup).user_id;
      if (owner && owner !== user_id) {
        throw new HttpError(400, `⚠️ สลิปนี้ถูกใช้เติมเงินโดยบัญชีอื่นไปแล้ว (Ref: ${transRef})`, 'DUPLICATE_OTHER_USER');
      }
      const topupStatus = existing.topup ? existing.topup.status : null;

      if (existing.txn || topupStatus === 'approved') {
        throw new HttpError(400, `⚠️ สลิปนี้เคยใช้งานเติมเงินเข้าสู่กระเป๋าไปแล้ว (Ref: ${transRef}) ไม่สามารถใช้สลิปเดิมซ้ำได้`, 'DUPLICATE_SLIP', {
          transRef,
          alreadyCredited: true,
          duplicate: true,
          amount: Number((existing.txn || existing.topup).amount)
        });
      }

      if (topupStatus === 'pending') {
        if (!slipInfo) {
          throw new HttpError(409, '⏳ สลิปนี้ส่งเข้าระบบแล้วและกำลังรอแอดมินตรวจสอบ ไม่ต้องส่งซ้ำครับ', 'PENDING_REVIEW');
        }
        // Slip was queued earlier (SlipOK down) and is now bank-verified -> approve it automatically
        const credit = await creditWallet({
          userId: user_id,
          amount: verifiedAmount,
          reference: transRef,
          gatewayRef: `SLIPOK-${transRef}`,
          description: `เติมเงินผ่าน PromptPay (SlipOK Verified Ref: ${transRef})`
        });
        await supabase.from('topups').update({
          status: 'approved',
          amount: verifiedAmount,
          gateway_ref: `SLIPOK-${transRef}`,
          verified_by: 'SlipOK Banking Switch (ตรวจซ้ำอัตโนมัติ)'
        }).eq('id', existing.topup.id);
        return res.status(200).json({
          success: true, status: 'approved', amount: verifiedAmount, balanceAfter: credit.balAfter, transRef,
          message: 'เติมเงินสำเร็จเรียบร้อย ยอดเงินเข้ากระเป๋าแล้ว'
        });
      }

      if (topupStatus === 'rejected') {
        throw new HttpError(400, '❌ สลิปนี้เคยถูกแอดมินปฏิเสธไปแล้ว หากคิดว่าผิดพลาดกรุณาติดต่อแอดมิน', 'REJECTED_BEFORE');
      }
    }

    // ---- 5a. Bank-verified -> credit immediately ----
    if (slipInfo) {
      let credit;
      try {
        credit = await creditWallet({
          userId: user_id,
          amount: verifiedAmount,
          reference: transRef,
          gatewayRef: `SLIPOK-${transRef}`,
          description: `เติมเงินผ่าน PromptPay (SlipOK Verified Ref: ${transRef})`
        });
      } catch (e) {
        if (e.code === 'ALREADY_CREDITED') {
          throw new HttpError(400, `⚠️ สลิปนี้เคยใช้งานเติมเงินเข้าสู่กระเป๋าไปแล้ว (Ref: ${transRef}) ไม่สามารถใช้สลิปเดิมซ้ำได้`, 'DUPLICATE_SLIP', {
            transRef,
            alreadyCredited: true,
            duplicate: true,
            amount: verifiedAmount
          });
        }
        throw e;
      }

      const { error: tErr } = await supabase.from('topups').insert({
        user_id,
        username: credit.username,
        amount: verifiedAmount,
        payment_method: 'PromptPay QR (Auto-Verified)',
        slip_url: slipData,
        transaction_ref: transRef,
        gateway_ref: `SLIPOK-${transRef}`,
        verified_by: `SlipOK Banking Switch (${BANK_NAMES[slipInfo.sendingBank] || slipInfo.sendingBank || 'ธนาคาร'})`,
        status: 'approved'
      });
      if (tErr) console.warn('[Topup history insert warning]', tErr.message); // ledger already holds the truth

      console.log(`[✅ Credited] ${credit.username} +฿${verifiedAmount} (Ref ${transRef}) -> ฿${credit.balAfter}`);
      return res.status(200).json({
        success: true,
        status: 'approved',
        amount: verifiedAmount,
        balanceAfter: credit.balAfter,
        transRef,
        message: 'เติมเงินสำเร็จเรียบร้อย ยอดเงินเข้ากระเป๋าแล้ว'
      });
    }

    // ---- 5b. Cannot verify with bank right now -> queue for admin (NO points added) ----
    const { error: pErr } = await supabase.from('topups').insert({
      user_id,
      username: profile.username,
      amount: requestedAmount,
      payment_method: 'PromptPay QR',
      slip_url: slipData,
      transaction_ref: transRef,
      gateway_ref: `SLIP-${transRef}`,
      verified_by: `รอแอดมินตรวจสอบ (${pendingReason})`,
      status: 'pending'
    });
    if (pErr) {
      if (pErr.code === '23505') throw new HttpError(409, '⏳ สลิปนี้ส่งเข้าระบบแล้วและกำลังรอแอดมินตรวจสอบ', 'PENDING_REVIEW');
      throw new Error('บันทึกสลิปไม่สำเร็จ: ' + pErr.message);
    }

    console.log(`[⏳ Pending] ${profile.username} ฿${requestedAmount} (Ref ${transRef}) reason: ${pendingReason}`);
    return res.status(200).json({
      success: true,
      status: 'pending',
      amount: requestedAmount,
      transRef,
      reason: pendingReason,
      message: 'ระบบได้รับสลิปแล้ว กำลังรอแอดมินตรวจสอบยอดเงิน (พอยท์จะเข้าทันทีเมื่อแอดมินยืนยัน)'
    });

  } catch (err) {
    const status = err.httpStatus || 500;
    if (status >= 500) console.error('Slip Verification Endpoint Error:', err);
    return res.status(status).json({
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: status >= 500 ? 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์: ' + err.message : err.message,
      ...(err.extra || {})
    });
  } finally {
    if (lockedRef) inFlightRefs.delete(lockedRef);
  }
});

// ==============================================================================
// 1.6 STANDALONE SLIPOK CHECKER & CONNECTION TEST (Used by NextJS & Admin Tools)
// ==============================================================================

app.post('/api/slip/check', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const { slip_data, qr_data, payload: rawPayload, amount, branch_id: customBranch, api_key: customKey } = req.body;

    // 1. Resolve SlipOK credentials from DB or request overrides
    const { data: settingsData } = await supabase.from('site_settings').select('*').limit(1);
    const settings = (settingsData && settingsData[0]) || {};
    const apiKey = (customKey || settings.gateway_api_key || process.env.SLIPOK_API_KEY || '').trim();
    const branchId = (customBranch || settings.gateway_branch_id || process.env.SLIPOK_BRANCH_ID || '').trim().replace(/^.*\/apikey\//i, '').replace(/[^a-zA-Z0-9_-]/g, '');

    if (!apiKey || !branchId) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ SlipOK Branch ID และ API Key ในหน้าตั้งค่าก่อนตรวจสอบสลิป'
      });
    }

    let slipOkData = null;
    let lastSlipError = null;
    const FormData = require('form-data');

    // Method 1: Check via Image Buffer (FormData files - same as nextjs-slipok-api-main)
    if (slip_data && typeof slip_data === 'string' && slip_data.includes('base64')) {
      try {
        const base64Data = slip_data.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        const form = new FormData();
        form.append('files', imgBuffer, { filename: 'slip.jpg', contentType: 'image/jpeg' });
        if (amount) form.append('amount', Number(amount));
        form.append('log', 'true');

        const slipRes = await axios.post(
          `https://api.slipok.com/api/line/apikey/${branchId}`,
          form,
          {
            headers: {
              ...form.getHeaders(),
              'x-authorization': apiKey
            },
            timeout: 10000
          }
        );
        if (slipRes.data && slipRes.data.success && slipRes.data.data) {
          slipOkData = slipRes.data.data;
        }
      } catch (err) {
        console.warn('Standalone SlipOK FormData error:', err.response?.data || err.message);
        lastSlipError = err.response?.data;
      }
    }

    // Method 2: Check via Decoded QR string (data: payload)
    const qrString = rawPayload || qr_data || '';
    if (!slipOkData && qrString) {
      try {
        const slipRes = await axios.post(
          `https://api.slipok.com/api/line/apikey/${branchId}`,
          { data: qrString, amount: amount ? Number(amount) : undefined, log: true },
          {
            headers: { 'x-authorization': apiKey, 'Content-Type': 'application/json' },
            timeout: 8000
          }
        );
        if (slipRes.data && slipRes.data.success && slipRes.data.data) {
          slipOkData = slipRes.data.data;
        }
      } catch (err) {
        console.warn('Standalone SlipOK QR data error:', err.response?.data || err.message);
        lastSlipError = err.response?.data;
      }
    }

    if (!slipOkData) {
      const errMsg = lastSlipError?.message || 'ไม่พบข้อมูลสลิปในระบบธนาคาร หรือรูปภาพไม่ใช่สลิปจริง กรุณาตรวจสอบไอดีสาขา SlipOK และรูปภาพ';
      return res.status(400).json({
        success: false,
        code: lastSlipError?.code,
        message: errMsg
      });
    }

    // Comprehensive Bank Code Mapping (same as nextjs-slipok-api-main)
    const bankNames = {
      '002': 'ธนาคารกรุงเทพ (BBL)',
      '004': 'ธนาคารกสิกรไทย (K-Bank)',
      '006': 'ธนาคารกรุงไทย (KTB)',
      '011': 'ธนาคารทหารไทยธนชาต (ttb)',
      '014': 'ธนาคารไทยพาณิชย์ (SCB)',
      '025': 'ธนาคารกรุงศรีอยุธยา (BAY)',
      '030': 'ธนาคารออมสิน (GSB)',
      '034': 'ธนาคาร ธ.ก.ส. (BAAC)',
      '069': 'ธนาคารเกียรตินาคินภัทร (KKP)',
      '022': 'ธนาคารซีไอเอ็มบีไทย (CIMBT)',
      '067': 'ธนาคารทิสโก้ (TISCO)',
      '073': 'ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)',
      '070': 'ธนาคารไอซีบีซี (ไทย)'
    };

    return res.status(200).json({
      success: true,
      message: 'ตรวจสอบสลิปสำเร็จ (SlipOK AI Verified)',
      data: {
        ...slipOkData,
        receivingBankName: bankNames[slipOkData.receivingBank] || slipOkData.receivingBank || 'ธนาคารพาณิชย์ไทย',
        sendingBankName: bankNames[slipOkData.sendingBank] || slipOkData.sendingBank || 'ธนาคารพาณิชย์ไทย'
      }
    });

  } catch (err) {
    console.error('Slip Check Endpoint Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Test SlipOK Connection (Validates Branch ID & API Key)
app.post('/api/slip/test-connection', async (req, res) => {
  try {
    const { branch_id: customBranch, api_key: customKey } = req.body;
    const { data: settingsData } = await supabase.from('site_settings').select('*').limit(1);
    const settings = (settingsData && settingsData[0]) || {};
    const apiKey = (customKey || settings.gateway_api_key || '').trim();
    const branchId = (customBranch || settings.gateway_branch_id || '').trim().replace(/^.*\/apikey\//i, '').replace(/[^a-zA-Z0-9_-]/g, '');

    if (!apiKey || !branchId) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกทั้ง SlipOK Branch ID และ API Key' });
    }

    try {
      const pingRes = await axios.post(
        `https://api.slipok.com/api/line/apikey/${branchId}`,
        { data: '004600060000010103004022520261014TESTPING00005102TH9104EF12' },
        { headers: { 'x-authorization': apiKey, 'Content-Type': 'application/json' }, timeout: 6000 }
      );
      return res.json({ success: true, message: 'เชื่อมต่อ SlipOK สำเร็จ! Branch ID และ API Key ใช้งานได้' });
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.code === 1001) {
        return res.status(400).json({ success: false, code: 1001, message: 'ไม่พบข้อมูลสาขา กรุณาตรวจสอบ SlipOK Branch ID ในแดชบอร์ด SlipOK' });
      }
      if (err.response?.status === 401 || errData?.code === 1000) {
        return res.status(400).json({ success: false, code: 1000, message: 'API Key ไม่ถูกต้อง กรุณาตรวจสอบ x-authorization API Key' });
      }
      // If code is not 1001 (e.g. 1002 slip not found), branch and key are VALID!
      if (err.response?.status === 400 && errData && errData.code !== 1001) {
        return res.json({ success: true, message: 'เชื่อมต่อ SlipOK สำเร็จ! สาขาและ API Key ถูกต้อง (พร้อมตรวจสอบสลิป)' });
      }
      return res.status(400).json({ success: false, message: errData?.message || err.message });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Admin Approval Endpoint (idempotent: can never credit the same topup twice)
app.post('/api/admin/topup/approve', async (req, res) => {
  let lockedRef = null;
  try {
    const { topup_id, amount } = req.body || {};
    if (!topup_id) throw new HttpError(400, 'Missing topup_id', 'BAD_REQUEST');

    const { data: topup, error: fetchErr } = await supabase.from('topups').select('*').eq('id', topup_id).single();
    if (fetchErr || !topup) throw new HttpError(404, 'ไม่พบรายการเติมเงิน', 'NOT_FOUND');
    if (topup.status === 'approved') throw new HttpError(400, 'รายการนี้ได้รับการอนุมัติไปแล้ว', 'ALREADY_APPROVED');

    const creditAmt = roundMoney((amount !== undefined && amount !== null && !isNaN(Number(amount))) ? Number(amount) : Number(topup.amount));
    if (!creditAmt || creditAmt <= 0) throw new HttpError(400, 'ยอดเงินไม่ถูกต้อง', 'BAD_REQUEST');

    const reference = sanitizeRef(topup.transaction_ref) || `TOPUP-${topup.id}`;
    if (inFlightRefs.has(reference)) throw new HttpError(409, 'รายการนี้กำลังถูกดำเนินการอยู่', 'IN_PROGRESS');
    inFlightRefs.add(reference);
    lockedRef = reference;

    let credit;
    try {
      credit = await creditWallet({
        userId: topup.user_id,
        amount: creditAmt,
        reference,
        gatewayRef: topup.gateway_ref || `SLIP-${reference}`,
        description: `อนุมัติการเติมเงินโดยแอดมิน (Ref: ${reference})`
      });
    } catch (e) {
      if (e.code === 'ALREADY_CREDITED') {
        // Ledger already has it (e.g. earlier partial failure) -> just sync the topup status
        await supabase.from('topups').update({ status: 'approved', verified_by: 'Admin Approved' }).eq('id', topup.id);
        throw new HttpError(400, 'รายการนี้เคยเติมพอยท์ไปแล้ว (ระบบอัปเดตสถานะให้ตรงกันแล้ว)', 'ALREADY_APPROVED');
      }
      throw e;
    }

    await supabase.from('topups').update({
      status: 'approved',
      amount: creditAmt,
      verified_by: 'Admin Approved'
    }).eq('id', topup.id);

    return res.status(200).json({
      success: true,
      amount: creditAmt,
      balanceAfter: credit.balAfter,
      message: `อนุมัติสำเร็จ เพิ่มพอยท์ ฿${creditAmt.toFixed(2)} ให้กับ ${credit.username} แล้ว`
    });
  } catch (err) {
    const status = err.httpStatus || 500;
    if (status >= 500) console.error('Admin Topup Approve Error:', err);
    return res.status(status).json({ success: false, code: err.code || 'SERVER_ERROR', message: err.message });
  } finally {
    if (lockedRef) inFlightRefs.delete(lockedRef);
  }
});

// Admin Rejection Endpoint (cannot reject a topup that already credited points)
app.post('/api/admin/topup/reject', async (req, res) => {
  try {
    const { topup_id, reason } = req.body || {};
    if (!topup_id) throw new HttpError(400, 'Missing topup_id', 'BAD_REQUEST');

    const { data: topup, error: fetchErr } = await supabase.from('topups').select('*').eq('id', topup_id).single();
    if (fetchErr || !topup) throw new HttpError(404, 'ไม่พบรายการเติมเงิน', 'NOT_FOUND');

    if (topup.status === 'approved') {
      throw new HttpError(400, 'รายการนี้อนุมัติและเติมพอยท์ไปแล้ว ไม่สามารถปฏิเสธได้ (หากต้องการหักพอยท์ ให้ปรับยอดเงินผู้ใช้แทน)', 'ALREADY_APPROVED');
    }
    const reference = sanitizeRef(topup.transaction_ref);
    if (reference) {
      const { data: ledger } = await supabase.from('wallet_transactions').select('id').eq('reference_id', reference).limit(1);
      if (ledger && ledger.length > 0) {
        await supabase.from('topups').update({ status: 'approved' }).eq('id', topup.id);
        throw new HttpError(400, 'รายการนี้มีการเติมพอยท์ไปแล้วในบัญชี ไม่สามารถปฏิเสธได้', 'ALREADY_APPROVED');
      }
    }

    await supabase.from('topups').update({
      status: 'rejected',
      verified_by: `Admin Rejected: ${reason || 'สลิปไม่ถูกต้อง'}`
    }).eq('id', topup.id);

    return res.status(200).json({ success: true, message: 'ปฏิเสธรายการเรียบร้อยแล้ว (ไม่มีการเพิ่มพอยท์)' });
  } catch (err) {
    const status = err.httpStatus || 500;
    if (status >= 500) console.error('Admin Topup Reject Error:', err);
    return res.status(status).json({ success: false, code: err.code || 'SERVER_ERROR', message: err.message });
  }
});

// ==============================================================================
// 2. OMISE PROMPTPAY CHARGES API
// ==============================================================================

// POST /api/topup/create
app.post('/api/topup/create', async (req, res) => {
  try {
    const { user_id, username, amount } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'Missing user_id' });
    }
    if (isNaN(parsedAmount) || parsedAmount < 1 || parsedAmount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount. Must be between 1.00 THB and 50,000.00 THB'
      });
    }

    const amountInSatang = Math.round(parsedAmount * 100);
    let chargeId = '';
    let qrImageUrl = '';
    let expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    if (OMISE_SECRET_KEY && !OMISE_SECRET_KEY.includes('xxxx')) {
      try {
        const omiseResponse = await axios.post(
          'https://api.omise.co/charges',
          {
            amount: amountInSatang,
            currency: 'THB',
            source: { type: 'promptpay' },
            metadata: {
              user_id: user_id,
              username: username || 'Member',
              shop: 'Little Cloud Shop'
            }
          },
          { headers: getOmiseAuthHeader() }
        );

        const charge = omiseResponse.data;
        chargeId = charge.id;
        
        if (charge.source && charge.source.scannable_code && charge.source.scannable_code.image) {
          qrImageUrl = charge.source.scannable_code.image.download_uri;
        }
        if (charge.expires_at) {
          expiresAt = charge.expires_at;
        }
      } catch (omiseErr) {
        console.error('Omise API Error:', omiseErr.response?.data || omiseErr.message);
        return res.status(502).json({
          success: false,
          message: 'Error creating Omise charge: ' + (omiseErr.response?.data?.message || omiseErr.message)
        });
      }
    } else {
      chargeId = `chrg_test_mock_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      qrImageUrl = `https://promptpay.io/0815993194/${parsedAmount}.png`;
    }

    const { data: txData, error: txError } = await supabase
      .from('topup_transactions')
      .insert({
        user_id: user_id,
        username: username || 'Member',
        omise_charge_id: chargeId,
        amount: parsedAmount,
        status: 'pending',
        qr_code_url: qrImageUrl,
        expires_at: expiresAt
      })
      .select()
      .single();

    if (txError) {
      console.warn('DB Insert Warning:', txError.message);
    }

    return res.status(200).json({
      success: true,
      charge_id: chargeId,
      amount: parsedAmount,
      currency: 'THB',
      qr_code_url: qrImageUrl,
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Topup Create Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
  }
});

// POST /api/webhook/omise
app.post('/api/webhook/omise', async (req, res) => {
  try {
    const event = req.body;
    console.log(`[Omise Webhook] Received Event: ${event.key || event.object}`);

    if (!event || !event.data || event.data.object !== 'charge') {
      return res.status(200).json({ message: 'Ignored non-charge event' });
    }

    const charge = event.data;
    const chargeId = charge.id;
    const isSuccessful = charge.status === 'successful' && charge.paid === true;

    if (!isSuccessful) {
      if (charge.status === 'failed' || charge.status === 'expired') {
        await supabase
          .from('topup_transactions')
          .update({ status: charge.status, updated_at: new Date().toISOString() })
          .eq('omise_charge_id', chargeId);
      }
      return res.status(200).json({ message: `Charge status: ${charge.status}` });
    }

    const { data: tx, error: fetchErr } = await supabase
      .from('topup_transactions')
      .select('*')
      .eq('omise_charge_id', chargeId)
      .single();

    if (!tx) {
      console.warn(`[Webhook Warning] Transaction not found for charge: ${chargeId}`);
      return res.status(200).json({ message: 'Transaction record not found' });
    }

    if (tx.status === 'completed') {
      console.log(`[Idempotency] Charge ${chargeId} was already credited. Skipping.`);
      return res.status(200).json({ message: 'Already processed' });
    }

    const userId = tx.user_id;
    const amount = Number(tx.amount);

    const { data: rpcResult, error: rpcError } = await supabase.rpc('credit_user_wallet_atomic', {
      p_user_id: userId,
      p_charge_id: chargeId,
      p_amount: amount,
      p_type: 'topup',
      p_description: `Omise PromptPay Topup (${chargeId})`
    });

    if (rpcError) {
      console.error('[Webhook RPC Error] Atomic credit failed:', rpcError.message);
      const { data: profile } = await supabase.from('profiles').select('balance, username').eq('id', userId).single();
      if (profile) {
        const newBalance = Number(profile.balance || 0) + amount;
        await supabase.from('profiles').update({ balance: newBalance }).eq('id', userId);
        await supabase.from('topup_transactions').update({ status: 'completed' }).eq('omise_charge_id', chargeId);
        await supabase.from('credit_logs').insert({
          user_id: userId,
          username: profile.username,
          amount: amount,
          type: 'topup',
          ref_transaction_id: chargeId,
          balance_before: profile.balance,
          balance_after: newBalance,
          description: `Omise PromptPay Topup (${chargeId})`
        });
      }
    }

    console.log(`[Webhook Success] Credited ฿${amount} to User ${userId} for Charge ${chargeId}`);
    return res.status(200).json({ success: true, message: 'Wallet credited successfully' });
  } catch (error) {
    console.error('Omise Webhook Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/topup/status/:charge_id
app.get('/api/topup/status/:charge_id', async (req, res) => {
  try {
    const { charge_id } = req.params;

    const { data: tx, error } = await supabase
      .from('topup_transactions')
      .select('*')
      .eq('omise_charge_id', charge_id)
      .single();

    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (tx.status === 'pending' && OMISE_SECRET_KEY && !OMISE_SECRET_KEY.includes('xxxx')) {
      try {
        const omiseRes = await axios.get(`https://api.omise.co/charges/${charge_id}`, {
          headers: getOmiseAuthHeader()
        });
        const charge = omiseRes.data;

        if (charge.status === 'successful' && charge.paid) {
          await supabase.rpc('credit_user_wallet_atomic', {
            p_user_id: tx.user_id,
            p_charge_id: charge_id,
            p_amount: Number(tx.amount),
            p_type: 'topup',
            p_description: `Omise PromptPay Topup (Verified via Polling)`
          });
          tx.status = 'completed';
        } else if (charge.status === 'failed' || charge.status === 'expired') {
          tx.status = charge.status;
          await supabase.from('topup_transactions').update({ status: charge.status }).eq('omise_charge_id', charge_id);
        }
      } catch (e) {
        console.warn('Omise live status check failed:', e.message);
      }
    }

    const { data: profile } = await supabase.from('profiles').select('balance').eq('id', tx.user_id).single();

    return res.status(200).json({
      success: true,
      charge_id: tx.omise_charge_id,
      status: tx.status,
      amount: tx.amount,
      balance: profile ? profile.balance : 0,
      updated_at: tx.updated_at
    });
  } catch (error) {
    console.error('Status Check Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==============================================================================
// 3. CHAT ENDPOINTS (Live Customer Support Chat)
// ==============================================================================
const CHAT_FILE = path.join(__dirname, 'chat_history.json');
const loadChatHistory = () => {
  if (fs.existsSync(CHAT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf-8'));
    } catch (e) {
      return [];
    }
  }
  return [];
};
const saveChatHistory = (chats) => {
  try {
    fs.writeFileSync(CHAT_FILE, JSON.stringify(chats, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Chat Save Warning]', e.message);
  }
};

app.get('/api/chat/list', (req, res) => {
  const orderId = req.query.order_id || 'general';
  const chats = loadChatHistory();
  const filtered = chats.filter(c => c.order_id === orderId);
  return res.json({ success: true, messages: filtered });
});

app.post('/api/chat/send', (req, res) => {
  try {
    const { order_id, user_id, username, sender_role, message, attachment, product_name, delivery_code } = req.body;
    if (!message && !attachment) {
      return res.status(400).json({ success: false, message: 'Message or attachment is required' });
    }
    const msgObj = {
      id: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      order_id: order_id || 'general',
      user_id: user_id || '',
      username: username || 'Customer',
      sender_role: sender_role || 'customer',
      message: message || '',
      attachment: attachment || '',
      product_name: product_name || '',
      delivery_code: delivery_code || '',
      created_at: new Date().toISOString()
    };
    const chats = loadChatHistory();
    chats.push(msgObj);
    saveChatHistory(chats);
    return res.json({ success: true, message: msgObj });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Start Server on 0.0.0.0 to accept LAN connections from mobile devices
app.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log(`=======================================================`);
  console.log(`🚀 Little Cloud Shop Server is running on port ${PORT}`);
  console.log(`💻 Local URL:  http://localhost:${PORT}`);
  console.log(`📱 Mobile LAN: http://${lanIp}:${PORT}`);
  console.log(`📷 Slip QR Upload: http://${lanIp}:${PORT}/upload-slip.html`);
  console.log(`💳 PromptPay API: http://localhost:${PORT}/api/topup/create`);
  console.log(`🔔 Webhook URL: http://localhost:${PORT}/api/webhook/omise`);
  console.log(`=======================================================`);
});
