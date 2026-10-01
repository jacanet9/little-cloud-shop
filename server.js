// ==============================================================================
// LITTLE CLOUD SHOP - BACKEND SERVER (Node.js / Express)
// Real Omise PromptPay Charges API + Webhook + Atomic Wallet + Mobile Slip Relay
// ==============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

// Middlewares - Support large image uploads (up to 50MB base64)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, './')));

// In-memory Mobile Slip Sessions Store
const SLIP_SESSIONS = {};

// Clean up expired slip sessions (older than 30 mins)
setInterval(() => {
  const now = Date.now();
  for (const sid in SLIP_SESSIONS) {
    if (now - (SLIP_SESSIONS[sid].created_at || 0) > 30 * 60 * 1000) {
      delete SLIP_SESSIONS[sid];
    }
  }
}, 5 * 60 * 1000);

// Helper: Detect Active LAN IPv4 Address
function getLanIp() {
  const interfaces = os.networkInterfaces();
  // Preferred interfaces first
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Prioritize standard local subnet IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(iface.address)) {
          return iface.address;
        }
      }
    }
  }
  // Secondary fallback for any non-internal IPv4
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

    SLIP_SESSIONS[session_id] = {
      status: 'completed',
      slip_data: image_data,
      filename: filename || 'mobile_slip.jpg',
      uploaded_at: Date.now()
    };

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

// Check Slip Upload Status (PC Polling)
app.get('/api/slip/check/:session_id', (req, res) => {
  const { session_id } = req.params;
  const session = SLIP_SESSIONS[session_id];

  if (!session) {
    return res.status(404).json({
      success: false,
      message: 'ไม่พบ Session นี้ หรือ Session หมดอายุแล้ว'
    });
  }

  return res.status(200).json({
    success: true,
    status: session.status,
    slip_data: session.slip_data,
    filename: session.filename
  });
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
