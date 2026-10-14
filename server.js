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
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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

  if (!session) {
    SLIP_SESSIONS[session_id] = {
      session_id: session_id,
      status: 'waiting',
      slip_data: null,
      filename: null,
      created_at: Date.now()
    };
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

  if (latest && latest.slip_data) {
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
// Replay Protection + BOT Standard Tag Validation + SlipOK API + Pending Admin Fallback
// ==============================================================================

app.post('/api/slip/verify', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const { user_id, username, amount, slip_data, qr_data, payload: rawPayload } = req.body;
    const requestedAmount = parseFloat(amount);

    if (!user_id || isNaN(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'ข้อมูลการเติมเงินไม่ถูกต้อง' });
    }

    let payload = (rawPayload || qr_data || '').trim();
    if (!slip_data && !payload) {
      return res.status(400).json({ success: false, message: 'กรุณาแนบรูปภาพสลิปหลักฐานการโอนเงิน' });
    }

    // 1. Resolve QR Payload if not supplied directly
    if (!payload && slip_data) {
      try {
        const base64Data = slip_data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const jpeg = require('jpeg-js');
        const rawImageData = jpeg.decode(buffer, { useTArray: true });
        if (rawImageData && rawImageData.data) {
          const jsQR = require('jsqr');
          const code = jsQR(rawImageData.data, rawImageData.width, rawImageData.height, { inversionAttempts: 'attemptBoth' });
          if (code && code.data) payload = code.data.trim();
        }
      } catch (decErr) {
        console.warn('Server slip QR decode error:', decErr.message);
      }
    }

    if (!payload) {
      return res.status(400).json({
        success: false,
        message: '❌ ตรวจสอบไม่ผ่าน: ไม่พบ QR Code บนรูปภาพ หรือภาพไม่ชัดเจน กรุณาใช้รูปสลิปจริงที่ได้จากแอปธนาคาร'
      });
    }

    // 2. Parse TLV (Tag-Length-Value) standard format for Thai Bank e-Slips
    const parseTLV = (str) => {
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
    };

    const outerTags = parseTLV(payload);
    let isBankSlip = false;
    let bankCode = '';
    let transRef = '';

    if (outerTags['00']) {
      const innerTags = parseTLV(outerTags['00']);
      if (innerTags['00'] === '000001' || innerTags['01'] || innerTags['02']) {
        isBankSlip = true;
        bankCode = innerTags['01'] || outerTags['01'] || '';
        transRef = innerTags['02'] || outerTags['02'] || '';
      }
    }

    if (!isBankSlip) {
      if (payload.includes('000001') || outerTags['02'] || (payload.startsWith('00') && payload.length > 25)) {
        isBankSlip = true;
        transRef = outerTags['02'] || payload.substring(10, 35).replace(/[^a-zA-Z0-9]/g, '');
        bankCode = outerTags['01'] || '';
      }
    }

    if (!transRef) {
      const refMatch = payload.match(/02([0-9]{2})([A-Za-z0-9_-]+)/);
      if (refMatch && refMatch[2]) {
        isBankSlip = true;
        transRef = refMatch[2];
      }
    }

    if (!isBankSlip || !transRef || transRef.length < 10) {
      return res.status(400).json({
        success: false,
        message: '❌ ตรวจสอบไม่ผ่าน: QR Code บนรูปภาพไม่ใช่สลิปโอนเงินของธนาคาร (ไม่ใช่ Thai Bank e-Slip QR) ระบบไม่อนุญาตให้ใช้สลิปปลอม'
      });
    }

    // 3. Anti-Replay Duplicate Check in Supabase
    const { data: dupTxn } = await supabase
      .from('wallet_transactions')
      .select('reference_id, user_id, amount, status')
      .or(`reference_id.eq.${transRef},gateway_ref.eq.${transRef},gateway_ref.eq.SLIP-${transRef}`)
      .limit(1);

    const { data: dupTopup } = await supabase
      .from('topups')
      .select('transaction_ref, user_id, amount, status')
      .or(`transaction_ref.eq.${transRef},gateway_ref.eq.${transRef}`)
      .limit(1);

    if ((dupTxn && dupTxn.length > 0) || (dupTopup && dupTopup.length > 0)) {
      const dup = (dupTxn && dupTxn[0]) || (dupTopup && dupTopup[0]);
      if (dup.user_id === user_id && dup.status === 'approved') {
        return res.status(200).json({
          success: true,
          status: 'already_credited',
          alreadyCredited: true,
          message: 'สลิปนี้ได้รับการเติมเงินสำเร็จไปแล้วในระบบ',
          transRef,
          amount: Number(dup.amount)
        });
      }
      return res.status(400).json({
        success: false,
        message: `⚠️ สลิปนี้ถูกใช้งานไปแล้วในระบบ (รหัสอ้างอิง: ${transRef}) ไม่สามารถใช้สลิปซ้ำได้เพื่อความปลอดภัย`
      });
    }

    // 4. Fetch Gateway Configuration from Supabase site_settings
    const { data: settingsData } = await supabase.from('site_settings').select('*').limit(1);
    const settings = (settingsData && settingsData[0]) || {};
    const apiKey = (settings.gateway_api_key || '').trim();
    const branchId = (settings.gateway_branch_id || '').trim().replace(/^.*\/apikey\//i, '').replace(/[^a-zA-Z0-9_-]/g, '');
    const promptpayNum = (settings.promptpay_number || '0815993194').replace(/[^0-9]/g, '');

    let slipOkVerified = false;
    let verifiedAmount = requestedAmount;

    // Check with SlipOK API if configured
    if (apiKey && branchId) {
      try {
        console.log(`[*] Calling SlipOK verification for branch: ${branchId}...`);
        const FormData = require('form-data');
        let slipOkResp = null;

        // Priority 1: Check via Slip Image File (FormData 'files' - same as nextjs-slipok-api-main)
        if (slip_data && typeof slip_data === 'string' && slip_data.includes('base64')) {
          try {
            const base64Data = slip_data.replace(/^data:image\/\w+;base64,/, '');
            const imgBuffer = Buffer.from(base64Data, 'base64');
            const form = new FormData();
            form.append('files', imgBuffer, { filename: 'slip.jpg', contentType: 'image/jpeg' });
            if (requestedAmount) form.append('amount', requestedAmount);
            form.append('log', 'true');

            slipOkResp = await axios.post(
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
          } catch (fileErr) {
            console.warn('SlipOK FormData check error:', fileErr.response?.data || fileErr.message);
          }
        }

        // Priority 2: Fallback to decoded QR string payload check
        if (!slipOkResp && payload) {
          try {
            slipOkResp = await axios.post(
              `https://api.slipok.com/api/line/apikey/${branchId}`,
              { data: payload, amount: requestedAmount, log: true },
              { headers: { 'x-authorization': apiKey, 'Content-Type': 'application/json' }, timeout: 8000 }
            );
          } catch (qrErr) {
            console.warn('SlipOK QR string check error:', qrErr.response?.data || qrErr.message);
            throw qrErr;
          }
        }

        if (slipOkResp && slipOkResp.data && slipOkResp.data.success && slipOkResp.data.data) {
          const slipInfo = slipOkResp.data.data;
          const actualAmount = Number(slipInfo.amount) || requestedAmount;

          if (Math.abs(actualAmount - requestedAmount) > 0.01) {
            return res.status(400).json({
              success: false,
              message: `❌ ยอดเงินในสลิปจริง (฿${actualAmount.toFixed(2)}) ไม่ตรงกับยอดที่ระบุเติม (฿${requestedAmount.toFixed(2)}) ระบบปฏิเสธการเติมเงิน`
            });
          }

          if (slipInfo.receiver) {
            const rx = slipInfo.receiver;
            let rxRaw = '';
            if (typeof rx.account === 'string') {
              rxRaw = rx.account;
            } else if (rx.account && typeof rx.account.value === 'string') {
              rxRaw = rx.account.value;
            } else if (rx.proxy && typeof rx.proxy.value === 'string') {
              rxRaw = rx.proxy.value;
            }

            const rxAcc = rxRaw.replace(/[^0-9]/g, '');
            const cleanShopNum = (promptpayNum || '').replace(/[^0-9]/g, '');

            if (cleanShopNum && rxAcc && rxAcc.length >= 4) {
              const rxSuffix = rxAcc.slice(-4);
              const shopSuffix = cleanShopNum.slice(-4);
              const isMatch = rxAcc.includes(cleanShopNum) || cleanShopNum.includes(rxAcc) || (rxSuffix === shopSuffix);
              if (!isMatch) {
                return res.status(400).json({
                  success: false,
                  message: `❌ สลิปนี้ไม่ได้โอนเงินมายังบัญชีร้านค้า (${promptpayNum}) แต่โอนไปยังบัญชีอื่น ไม่อนุมัติ`
                });
              }
            }
          }

          slipOkVerified = true;
          verifiedAmount = actualAmount;
          if (slipInfo.transRef) transRef = slipInfo.transRef;
        } else if (slipOkResp && slipOkResp.data && !slipOkResp.data.success) {
          return res.status(400).json({
            success: false,
            message: '❌ การตรวจสอบสลิปล้มเหลว: ' + (slipOkResp.data?.message || 'ไม่พบรายการโอนเงินในระบบธนาคาร')
          });
        }
      } catch (slipErr) {
        const errData = slipErr.response?.data;
        console.warn('SlipOK Verification Result:', errData || slipErr.message);

        // If SlipOK returned error that the slip itself is fake or duplicate:
        if (errData && errData.code && errData.code !== 1001) {
          return res.status(400).json({
            success: false,
            message: '❌ ตรวจสอบสลิปไม่ผ่าน: ' + (errData.message || 'ไม่พบข้อมูลการโอนเงินจริงในระบบธนาคาร')
          });
        }
      }
    }

    // 5. DETERMINE APPROVAL ACTION
    if (slipOkVerified) {
      // AUTO-APPROVED VIA REAL BANK NETWORK
      const { data: userProfile } = await supabase.from('profiles').select('id, username, balance').eq('id', user_id).single();
      if (!userProfile) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้ในระบบ' });

      const balBefore = Number(userProfile.balance) || 0;
      const balAfter = balBefore + verifiedAmount;

      await supabase.from('profiles').update({ balance: balAfter, updated_at: new Date().toISOString() }).eq('id', user_id);

      await supabase.from('wallet_transactions').insert({
        user_id,
        username: userProfile.username,
        type: 'topup',
        amount: verifiedAmount,
        balance_before: balBefore,
        balance_after: balAfter,
        reference_id: transRef,
        gateway_ref: `SLIPOK-${transRef}`,
        description: `เติมเงินสำเร็จผ่าน PromptPay (SlipOK Verified Ref: ${transRef})`,
        status: 'completed'
      });

      await supabase.from('topups').insert({
        user_id,
        username: userProfile.username,
        amount: verifiedAmount,
        payment_method: 'PromptPay QR (Auto-Verified)',
        slip_url: slip_data || '',
        transaction_ref: transRef,
        gateway_ref: `SLIPOK-${transRef}`,
        verified_by: 'SlipOK Banking Switch',
        status: 'approved'
      });

      return res.status(200).json({
        success: true,
        status: 'approved',
        amount: verifiedAmount,
        balanceAfter: balAfter,
        transRef,
        message: 'เติมเงินสำเร็จเรียบร้อย ยอดเงินเข้ากระเป๋าแล้ว'
      });
    }

    // 6. IF NO WORKING BANK API: PUT IN PENDING MANUAL APPROVAL MODE (PREVENTS FAKE SLIPS FROM ADDING POINTS!)
    const { data: userProfile } = await supabase.from('profiles').select('id, username, balance').eq('id', user_id).single();
    if (!userProfile) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้ในระบบ' });

    await supabase.from('topups').insert({
      user_id,
      username: userProfile.username,
      amount: requestedAmount,
      payment_method: 'PromptPay QR',
      slip_url: slip_data || '',
      transaction_ref: transRef,
      gateway_ref: `SLIP-${transRef}`,
      verified_by: 'รอแอดมินตรวจสอบยอดเงิน',
      status: 'pending'
    });

    // NOTICE: profiles.balance IS NOT MODIFIED! ZERO FREE POINTS!
    return res.status(200).json({
      success: true,
      status: 'pending',
      amount: requestedAmount,
      transRef,
      message: 'ระบบได้รับสลิปแล้ว กำลังรอแอดมินตรวจสอบยอดเงินเข้าบัญชีธนาคาร (เครดิตจะถูกเพิ่มทันทีเมื่อแอดมินยืนยันยอดเงิน)'
    });

  } catch (err) {
    console.error('Slip Verification Endpoint Error:', err);
    return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์: ' + err.message });
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

// Admin Approval Endpoint
app.post('/api/admin/topup/approve', async (req, res) => {
  try {
    const { topup_id, amount } = req.body;
    if (!topup_id) {
      return res.status(400).json({ success: false, message: 'Missing topup_id' });
    }

    const { data: topup, error: fetchErr } = await supabase.from('topups').select('*').eq('id', topup_id).single();
    if (fetchErr || !topup) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการเติมเงิน' });
    }

    if (topup.status === 'approved') {
      return res.status(400).json({ success: false, message: 'รายการนี้ได้รับการอนุมัติไปแล้ว' });
    }

    const creditAmt = (amount !== undefined && !isNaN(Number(amount))) ? Number(amount) : Number(topup.amount);

    // Fetch user profile
    const { data: userProfile } = await supabase.from('profiles').select('id, username, balance').eq('id', topup.user_id).single();
    if (!userProfile) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้สำหรับรายการนี้' });
    }

    const balBefore = Number(userProfile.balance) || 0;
    const balAfter = balBefore + creditAmt;

    // 1. Update Profile Balance
    await supabase.from('profiles').update({ balance: balAfter, updated_at: new Date().toISOString() }).eq('id', userProfile.id);

    // 2. Insert Immutable Ledger Transaction Log
    await supabase.from('wallet_transactions').insert({
      user_id: userProfile.id,
      username: userProfile.username,
      type: 'topup',
      amount: creditAmt,
      balance_before: balBefore,
      balance_after: balAfter,
      reference_id: topup.transaction_ref,
      gateway_ref: topup.gateway_ref || `SLIP-${topup.transaction_ref}`,
      description: `อนุมัติการเติมเงินโดยแอดมิน (Ref: ${topup.transaction_ref})`,
      status: 'completed'
    });

    // 3. Update Topup Status
    await supabase.from('topups').update({
      status: 'approved',
      amount: creditAmt,
      verified_by: 'Admin Approved'
    }).eq('id', topup.id);

    return res.status(200).json({
      success: true,
      amount: creditAmt,
      balanceAfter: balAfter,
      message: `อนุมัติสำเร็จ เพิ่มพอยท์ ฿${creditAmt.toFixed(2)} ให้กับ ${userProfile.username} แล้ว`
    });
  } catch (err) {
    console.error('Admin Topup Approve Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Admin Rejection Endpoint
app.post('/api/admin/topup/reject', async (req, res) => {
  try {
    const { topup_id, reason } = req.body;
    if (!topup_id) {
      return res.status(400).json({ success: false, message: 'Missing topup_id' });
    }

    const { data: topup, error: fetchErr } = await supabase.from('topups').select('*').eq('id', topup_id).single();
    if (fetchErr || !topup) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการเติมเงิน' });
    }

    await supabase.from('topups').update({
      status: 'rejected',
      verified_by: `Admin Rejected: ${reason || 'สลิปไม่ถูกต้อง'}`
    }).eq('id', topup.id);

    return res.status(200).json({
      success: true,
      message: 'ปฏิเสธรายการเรียบร้อยแล้ว (ไม่มีการเพิ่มพอยท์)'
    });
  } catch (err) {
    console.error('Admin Topup Reject Error:', err);
    return res.status(500).json({ success: false, message: err.message });
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
