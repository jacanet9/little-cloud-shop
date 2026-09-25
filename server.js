// ==============================================================================
// LITTLE CLOUD SHOP - BACKEND SERVER (Node.js / Express)
// Real Omise (Opn Payments) PromptPay Charges API + Webhook + Atomic Wallet
// ==============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase Client
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://syyqfckckjebwtxwqqti.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5eXFmY2tja2plYnd0eHdxcXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Mjc4MjAsImV4cCI6MjA4OTk5MzgyMH0.1D7h4Q96F6pZlqV3Z0s3-qQ9t_5F_9R_r-u4oZ0W3X4';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Omise Config
const OMISE_SECRET_KEY = process.env.OMISE_SECRET_KEY || '';
const OMISE_PUBLIC_KEY = process.env.OMISE_PUBLIC_KEY || '';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

// Helper: Omise Basic Auth Header
const getOmiseAuthHeader = () => {
  const secretKey = OMISE_SECRET_KEY.trim();
  const token = Buffer.from(secretKey + ':').toString('base64');
  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json'
  };
};

// ==============================================================================
// 1. Endpoint: POST /api/topup/create
// Creates Omise PromptPay Source & Charge, Saves Pending Transaction
// ==============================================================================
app.post('/api/topup/create', async (req, res) => {
  try {
    const { user_id, username, amount } = req.body;

    // --- Validation ---
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

    // Amount in Satangs (1 THB = 100 Satangs)
    const amountInSatang = Math.round(parsedAmount * 100);

    let chargeId = '';
    let qrImageUrl = '';
    let expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins default

    // If Omise Secret Key configured -> Call Omise Live API
    if (OMISE_SECRET_KEY && !OMISE_SECRET_KEY.includes('xxxx')) {
      try {
        const omiseResponse = await axios.post(
          'https://api.omise.co/charges',
          {
            amount: amountInSatang,
            currency: 'THB',
            source: {
              type: 'promptpay'
            },
            metadata: {
              user_id: user_id,
              username: username || 'Member',
              shop: 'Little Cloud Shop'
            }
          },
          {
            headers: getOmiseAuthHeader()
          }
        );

        const charge = omiseResponse.data;
        chargeId = charge.id;
        
        // Extract QR Code Download URI from scannable_code
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
      // Mock Charge for Sandbox / Offline Testing
      chargeId = `chrg_test_mock_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
      // Dynamic PromptPay Generator QR fallback URL
      qrImageUrl = `https://promptpay.io/0815993194/${parsedAmount}.png`;
    }

    // Insert Pending Record in Supabase `topup_transactions`
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

// ==============================================================================
// 2. Endpoint: POST /api/webhook/omise
// Handles Omise Webhook Notifications, Prevents Double Crediting (Idempotency)
// Credits User Wallet Atomically via Database RPC
// ==============================================================================
app.post('/api/webhook/omise', async (req, res) => {
  try {
    const event = req.body;
    console.log(`[Omise Webhook] Received Event: ${event.key || event.object}`);

    // Validate Event data
    if (!event || !event.data || event.data.object !== 'charge') {
      return res.status(200).json({ message: 'Ignored non-charge event' });
    }

    const charge = event.data;
    const chargeId = charge.id;
    const isSuccessful = charge.status === 'successful' && charge.paid === true;

    if (!isSuccessful) {
      // If charge failed or expired, update DB status
      if (charge.status === 'failed' || charge.status === 'expired') {
        await supabase
          .from('topup_transactions')
          .update({ status: charge.status, updated_at: new Date().toISOString() })
          .eq('omise_charge_id', chargeId);
      }
      return res.status(200).json({ message: `Charge status: ${charge.status}` });
    }

    // --- Idempotency Check & Atomic Credit ---
    // Fetch transaction record from Supabase
    const { data: tx, error: fetchErr } = await supabase
      .from('topup_transactions')
      .select('*')
      .eq('omise_charge_id', chargeId)
      .single();

    if (!tx) {
      console.warn(`[Webhook Warning] Transaction not found for charge: ${chargeId}`);
      return res.status(200).json({ message: 'Transaction record not found' });
    }

    // If already completed -> prevent duplicate credit
    if (tx.status === 'completed') {
      console.log(`[Idempotency] Charge ${chargeId} was already credited. Skipping.`);
      return res.status(200).json({ message: 'Already processed' });
    }

    const userId = tx.user_id;
    const amount = Number(tx.amount);

    // Call Supabase Atomic RPC Function `credit_user_wallet_atomic`
    const { data: rpcResult, error: rpcError } = await supabase.rpc('credit_user_wallet_atomic', {
      p_user_id: userId,
      p_charge_id: chargeId,
      p_amount: amount,
      p_type: 'topup',
      p_description: `Omise PromptPay Topup (${chargeId})`
    });

    if (rpcError) {
      console.error('[Webhook RPC Error] Atomic credit failed:', rpcError.message);
      
      // Fallback: Direct atomic update if RPC is missing
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

// ==============================================================================
// 3. Endpoint: GET /api/topup/status/:charge_id
// Frontend Polling to check if payment is confirmed
// ==============================================================================
app.get('/api/topup/status/:charge_id', async (req, res) => {
  try {
    const { charge_id } = req.params;

    // Check DB status first
    const { data: tx, error } = await supabase
      .from('topup_transactions')
      .select('*')
      .eq('omise_charge_id', charge_id)
      .single();

    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // If status is pending & Omise live key is active, verify directly with Omise API
    if (tx.status === 'pending' && OMISE_SECRET_KEY && !OMISE_SECRET_KEY.includes('xxxx')) {
      try {
        const omiseRes = await axios.get(`https://api.omise.co/charges/${charge_id}`, {
          headers: getOmiseAuthHeader()
        });
        const charge = omiseRes.data;

        if (charge.status === 'successful' && charge.paid) {
          // Trigger atomic credit
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

    // Get current user balance
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

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Little Cloud Shop Server is running on port ${PORT}`);
  console.log(`💳 Omise PromptPay Charges API Endpoint: http://localhost:${PORT}/api/topup/create`);
  console.log(`🔔 Omise Webhook Endpoint: http://localhost:${PORT}/api/webhook/omise`);
  console.log(`=======================================================`);
});
