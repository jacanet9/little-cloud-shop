// ==============================================================================
// LITTLE CLOUD SHOP - REAL PAYMENT GATEWAY & SLIP VERIFICATION ENGINE
// Supports SlipOK API, EasySlip API, Standard PromptPay EMVCo, & Webhooks
// ==============================================================================

class PaymentGatewayEngine {
  constructor() {}

  /**
   * Fetch Gateway Settings from Supabase site_settings
   */
  async getGatewayConfig() {
    try {
      const settings = await window.supabaseManager.fetchTable('site_settings');
      const s = Array.isArray(settings) ? (settings[0] || {}) : settings;
      return {
        provider: s.gateway_provider || 'promptpay_slipok',
        apiKey: (s.gateway_api_key && s.gateway_api_key.trim()) || '',
        branchId: (s.gateway_branch_id && s.gateway_branch_id.trim().replace(/^.*\/apikey\//i, '').replace(/[^a-zA-Z0-9_-]/g, '')) || '',
        secret: s.gateway_secret || '',
        promptpayNumber: (s.promptpay_number && s.promptpay_number.trim()) || '0815993194',
        promptpayName: (s.promptpay_name && s.promptpay_name.trim()) || 'Little Cloud Shop Official'
      };
    } catch (e) {
      return {
        provider: 'promptpay_slipok',
        apiKey: '',
        branchId: '',
        secret: '',
        promptpayNumber: '0815993194',
        promptpayName: 'Little Cloud Shop Official'
      };
    }
  }

  /**
   * Inspect and decode QR Code from uploaded Thai bank slip image
   * Validates Bank of Thailand (BOT) Standard for e-Slip QR payloads
   */
  async inspectBankSlip(slipInput, fallbackDataUrl) {
    let imgSrc = '';
    if (typeof slipInput === 'string' && slipInput.startsWith('data:image')) {
      imgSrc = slipInput;
    } else if (slipInput instanceof Blob || slipInput instanceof File) {
      imgSrc = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
        reader.readAsDataURL(slipInput);
      });
    } else if (fallbackDataUrl && typeof fallbackDataUrl === 'string' && fallbackDataUrl.startsWith('data:image')) {
      imgSrc = fallbackDataUrl;
    }

    if (!imgSrc) {
      throw new Error('กรุณาแนบรูปภาพสลิปหลักฐานการโอนเงินเพื่อทำการตรวจสอบ');
    }

    // Load image into HTML Canvas
    const imgBitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('ไม่สามารถประมวลผลรูปภาพได้ กรุณาตรวจสอบไฟล์รูปภาพ'));
      img.src = imgSrc;
    });

    let qrResult = null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Multi-pass scanning for maximum detection rate across all Thai banks
    if (typeof window.jsQR === 'function') {
      const w = imgBitmap.width;
      const h = imgBitmap.height;

      // Pass 1: Full image at different scales
      const scales = [1.0, 0.75, 0.5, 0.4, 1.25];
      for (const scale of scales) {
        const targetW = Math.round(w * scale);
        const targetH = Math.round(h * scale);
        if (targetW > 2500 || targetW < 250) continue;

        canvas.width = targetW;
        canvas.height = targetH;
        ctx.drawImage(imgBitmap, 0, 0, targetW, targetH);

        const imgData = ctx.getImageData(0, 0, targetW, targetH);
        qrResult = window.jsQR(imgData.data, targetW, targetH, { inversionAttempts: 'attemptBoth' });
        if (qrResult && qrResult.data && qrResult.data.trim()) break;
      }

      // Pass 2: Top-right quadrant (Krungthai, K-Bank, SCB, Bangkok Bank)
      if (!qrResult || !qrResult.data) {
        const cropX = Math.round(w * 0.45);
        const cropY = 0;
        const cropW = Math.round(w * 0.55);
        const cropH = Math.round(h * 0.5);
        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(imgBitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const imgData = ctx.getImageData(0, 0, cropW, cropH);
        qrResult = window.jsQR(imgData.data, cropW, cropH, { inversionAttempts: 'attemptBoth' });
      }

      // Pass 3: Top half (standard Thai e-Slips)
      if (!qrResult || !qrResult.data) {
        const cropW = w;
        const cropH = Math.round(h * 0.55);
        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(imgBitmap, 0, 0, cropW, cropH, 0, 0, cropW, cropH);

        const imgData = ctx.getImageData(0, 0, cropW, cropH);
        qrResult = window.jsQR(imgData.data, cropW, cropH, { inversionAttempts: 'attemptBoth' });
      }

      // Pass 4: Bottom-right quadrant (Some mobile banking formats)
      if (!qrResult || !qrResult.data) {
        const cropX = Math.round(w * 0.4);
        const cropY = Math.round(h * 0.45);
        const cropW = Math.round(w * 0.6);
        const cropH = Math.round(h * 0.55);
        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(imgBitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const imgData = ctx.getImageData(0, 0, cropW, cropH);
        qrResult = window.jsQR(imgData.data, cropW, cropH, { inversionAttempts: 'attemptBoth' });
      }
    }

    // Pass 5: Server-side High-Precision Inspector Fallback
    if (!qrResult || !qrResult.data) {
      try {
        const srvResp = await fetch('/api/slip/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_data: imgSrc })
        });
        if (srvResp.ok) {
          const srvData = await srvResp.json();
          if (srvData && srvData.success && srvData.qrData) {
            qrResult = { data: srvData.qrData };
          }
        }
      } catch (srvErr) {
        console.warn('Server slip inspection fallback warning:', srvErr);
      }
    }

    // If client jsQR couldn't decode QR, pass the slip image to server SlipOK AI engine directly
    if (!qrResult || !qrResult.data || !qrResult.data.trim()) {
      return {
        success: true,
        transRef: '',
        bankCode: '',
        bankName: 'ธนาคารพาณิชย์ไทย',
        rawPayload: '',
        imgSrc: imgSrc
      };
    }

    const payload = qrResult.data.trim();

    // Parse TLV (Tag-Length-Value) standard format for Thai Bank e-Slips
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

    // Customer attached the shop's PromptPay payment QR instead of their transfer slip
    if (payload.startsWith('000201')) {
      throw new Error('❌ รูปนี้คือ QR พร้อมเพย์สำหรับ "จ่ายเงิน" ไม่ใช่สลิปโอนเงิน กรุณาแนบสลิปที่ได้หลังโอนเงินสำเร็จ');
    }

    // Standard BOT Thai Bank e-Slip mini-QR (Tag 00 -> SubTag 00: 000001, 01: Bank, 02: TransRef)
    // Anything else is passed through untouched: the server + SlipOK reads the slip image itself.
    const outerTags = parseTLV(payload);
    let bankCode = '';
    let transRef = '';
    if (outerTags['00']) {
      const innerTags = parseTLV(outerTags['00']);
      if (innerTags['00'] === '000001' && innerTags['02']) {
        bankCode = innerTags['01'] || '';
        transRef = String(innerTags['02']).replace(/[^A-Za-z0-9_-]/g, '');
      }
    }

    // Comprehensive Thai Bank Mapping
    const bankNames = {
      '004': 'ธนาคารกสิกรไทย (K-Bank)',
      '014': 'ธนาคารไทยพาณิชย์ (SCB)',
      '006': 'ธนาคารกรุงไทย (KTB)',
      '002': 'ธนาคารกรุงเทพ (BBL)',
      '011': 'ธนาคารทหารไทยธนชาต (ttb)',
      '025': 'ธนาคารกรุงศรีอยุธยา (BAY)',
      '030': 'ธนาคารออมสิน (GSB)',
      '034': 'ธนาคาร ธ.ก.ส. (BAAC)',
      '069': 'ธนาคารเกียรตินาคินภัทร (KKP)',
      '022': 'ธนาคารซีไอเอ็มบีไทย (CIMBT)',
      '067': 'ธนาคารทิสโก้ (TISCO)',
      '073': 'ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)',
      '070': 'ธนาคารไอซีบีซี (ไทย)'
    };

    return {
      success: true,
      transRef: transRef,
      bankCode: bankCode,
      bankName: bankNames[bankCode] || 'ธนาคารพาณิชย์ไทย',
      rawPayload: payload,
      imgSrc: imgSrc
    };
  }

  /**
   * Real Slip Verification via Bank Slip QR Inspection + Duplicate Guard + Optional SlipOK API
   */
  /**
   * Real Slip Verification via Bank Slip QR Inspection + Server Anti-Fraud & SlipOK API
   */
  async verifyPayment({ amount, slipFile, slipDataUrl, user }) {
    if (!slipFile && !slipDataUrl) {
      throw new Error('กรุณาแนบรูปภาพสลิปหลักฐานการโอนเงินเพื่อทำการตรวจสอบ (ไม่สามารถผ่านได้โดยไม่มีสลิป)');
    }

    const expectedAmount = Number(amount);
    if (!expectedAmount || expectedAmount <= 0) {
      throw new Error('ยอดเงินไม่ถูกต้อง กรุณาระบุจำนวนเงินที่ต้องการเติม');
    }

    // 1. Client-side Real Slip QR Code Decoding & Authenticity Verification
    const slipInspection = await this.inspectBankSlip(slipFile, slipDataUrl);
    const transRef = slipInspection.transRef;

    // Normalize image (JPEG, max 1800px) -> smaller upload, still sharp enough for bank QR reading
    let resolvedSlipUrl = slipInspection.imgSrc || '';
    if (!resolvedSlipUrl) {
      try {
        resolvedSlipUrl = await this.getSlipDataUrl(slipFile, slipDataUrl);
      } catch (e) {}
    }
    resolvedSlipUrl = await this.normalizeSlipImage(resolvedSlipUrl);

    if (resolvedSlipUrl && transRef) {
      try {
        localStorage.setItem(`cloud_slip_${transRef}`, resolvedSlipUrl);
      } catch (storageErr) {}
    }

    // 2. Call Server-Side Verification Endpoint (Server validates BOT TLV, checks duplicates, & verifies with SlipOK)
    let serverResult = null;
    const candidateUrls = [
      '/api/slip/verify',
      'http://127.0.0.1:3000/api/slip/verify',
      'http://localhost:3000/api/slip/verify'
    ];

    let lastNetworkError = null;
    for (const url of candidateUrls) {
      let resp;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      try {
        resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            user_id: user.id,
            amount: expectedAmount,
            slip_data: resolvedSlipUrl,
            payload: slipInspection.rawPayload
          })
        });
      } catch (netErr) {
        clearTimeout(timeoutId);
        lastNetworkError = netErr;
        if (netErr.name === 'AbortError') {
          throw new Error('⏱️ การตรวจสอบสลิปใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง (ระบบจะไม่เติมเงินซ้ำ)');
        }
        continue; // server not reachable on this URL -> try next
      }
      clearTimeout(timeoutId);

      let resData = null;
      try { resData = await resp.json(); } catch (e) { resData = null; }
      if (!resData) {
        // Not our API (e.g. static file server returned HTML) -> try next candidate
        lastNetworkError = new Error(`HTTP ${resp.status}`);
        continue;
      }
      if (!resp.ok || resData.success === false) {
        const err = new Error(resData.message || 'การตรวจสอบสลิปล้มเหลว');
        err.code = resData.code;
        throw err;
      }
      serverResult = resData;
      break;
    }

    // 3. Handle Server Result
    if (serverResult) {
      if (serverResult.status === 'already_credited') {
        return {
          success: true,
          status: 'already_credited',
          alreadyCredited: true,
          duplicate: true,
          gateway: `PromptPay QR (${slipInspection.bankName})`,
          transactionRef: transRef,
          gatewayRef: `SLIP-${transRef}`,
          verifiedAmount: serverResult.amount || expectedAmount,
          balanceAfter: serverResult.currentBalance !== undefined ? serverResult.currentBalance : (user ? user.balance : undefined),
          bankName: slipInspection.bankName,
          imgSrc: resolvedSlipUrl,
          message: serverResult.message
        };
      }

      if (serverResult.status === 'approved') {
        // Auto-approved by bank API on server!
        if (serverResult.balanceAfter !== undefined && user) {
          user.balance = serverResult.balanceAfter;
          if (window.authManager) window.authManager.saveCurrentUser(user);
          if (window.updateUserBalanceDisplays) window.updateUserBalanceDisplays();
        }
        return {
          success: true,
          status: 'approved',
          alreadyCredited: false,
          gateway: 'PromptPay QR (SlipOK Verified)',
          transactionRef: serverResult.transRef || transRef,
          gatewayRef: `SLIPOK-${serverResult.transRef || transRef}`,
          verifiedAmount: serverResult.amount || expectedAmount,
          balanceAfter: serverResult.balanceAfter,
          bankName: slipInspection.bankName,
          imgSrc: resolvedSlipUrl
        };
      }

      // If status === 'pending':
      // CRITICAL SECURITY: AWAITING ADMIN MANUAL VERIFICATION - NO POINTS ADDED AUTOMATICALLY!
      return {
        success: true,
        status: 'pending',
        pending: true,
        alreadyCredited: false,
        gateway: `PromptPay QR (${slipInspection.bankName})`,
        transactionRef: transRef,
        gatewayRef: `SLIP-${transRef}`,
        verifiedAmount: expectedAmount,
        bankName: slipInspection.bankName,
        imgSrc: resolvedSlipUrl,
        message: serverResult.message || 'ระบบบันทึกสลิปแล้ว กำลังรอแอดมินตรวจสอบยอดเงินเข้าบัญชี'
      };
    }

    // 4. Server Offline Fallback: Anti-Replay Check in Supabase & Queue as PENDING (NEVER Auto-Credit!)
    console.warn('Backend server unreachable, queuing topup as PENDING in Supabase...', lastNetworkError);
    if (!transRef) {
      throw new Error('❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ตรวจสอบสลิปได้ในขณะนี้ กรุณาลองใหม่ภายหลัง หรือติดต่อแอดมิน');
    }
    const existingTransactions = await window.supabaseManager.fetchTable('wallet_transactions');
    const existingTopups = await window.supabaseManager.fetchTable('topups');

    const duplicateTxn = existingTransactions.find(t => 
      t.reference_id === transRef || t.gateway_ref === transRef || t.gateway_ref === `SLIP-${transRef}`
    );
    const duplicateTopup = existingTopups.find(t => 
      t.transaction_ref === transRef || t.gateway_ref === transRef
    );

    if (duplicateTxn || duplicateTopup) {
      throw new Error(`⚠️ สลิปนี้ถูกใช้งานไปแล้วในระบบ (รหัสอ้างอิง: ${transRef}) ไม่สามารถใช้สลิปซ้ำได้เพื่อความปลอดภัย`);
    }

    // Insert as pending in database
    await window.supabaseManager.insertRecord('topups', {
      user_id: user.id,
      username: user.username,
      amount: expectedAmount,
      payment_method: 'PromptPay QR',
      slip_url: resolvedSlipUrl,
      transaction_ref: transRef,
      gateway_ref: `SLIP-${transRef}`,
      verified_by: 'รอแอดมินตรวจสอบ (Offline Mode)',
      status: 'pending'
    });

    return {
      success: true,
      status: 'pending',
      pending: true,
      alreadyCredited: false,
      gateway: `PromptPay QR (${slipInspection.bankName})`,
      transactionRef: transRef,
      gatewayRef: `SLIP-${transRef}`,
      verifiedAmount: expectedAmount,
      bankName: slipInspection.bankName,
      imgSrc: resolvedSlipUrl,
      message: 'บันทึกสลิปสำเร็จ กำลังรอแอดมินตรวจสอบยอดเงินเข้าบัญชี'
    };
  }

  /**
   * Helper: Convert/compress slip image file to optimized Data URL
   */
  async getSlipDataUrl(slipFile, fallbackDataUrl) {
    if (fallbackDataUrl && typeof fallbackDataUrl === 'string' && fallbackDataUrl.startsWith('data:image')) {
      return fallbackDataUrl;
    }
    if (!slipFile) return '';
    if (typeof slipFile === 'string' && slipFile.startsWith('data:image')) {
      return slipFile;
    }
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const maxDim = 900;
              let w = img.width;
              let h = img.height;
              if (w > maxDim || h > maxDim) {
                if (w > h) {
                  h = Math.round((h * maxDim) / w);
                  w = maxDim;
                } else {
                  w = Math.round((w * maxDim) / h);
                  h = maxDim;
                }
              }
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/jpeg', 0.82));
            } catch (err) {
              resolve(e.target.result);
            }
          };
          img.onerror = () => resolve('');
          img.src = e.target.result;
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(slipFile);
      } catch (e) {
        resolve('');
      }
    });
  }

  /**
   * Helper: Normalize & optimize slip image to clean JPEG (max 1600px)
   * Keeps QR code razor-sharp while reducing upload payload size
   */
  async normalizeSlipImage(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
      return dataUrl || '';
    }
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const maxDim = 1600;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.88));
          } catch (err) {
            resolve(dataUrl);
          }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      } catch (e) {
        resolve(dataUrl);
      }
    });
  }

  /**
   * Process Full Payment & Credit Wallet Pipeline
   */
  async processTopupPipeline({ amount, slipFile, slipDataUrl }) {
    const user = window.authManager.currentUser;
    if (!user) throw new Error('กรุณาเข้าสู่ระบบก่อนทำรายการ');

    // 1. Verify Payment with Payment Gateway & Bank Slip Inspector
    const verification = await this.verifyPayment({ amount, slipFile, slipDataUrl, user });

    if (!verification.success) {
      throw new Error('การตรวจสอบการชำระเงินไม่ผ่าน');
    }

    // Convert/compress slip image to Data URL
    let resolvedSlipUrl = verification.imgSrc || '';
    if (!resolvedSlipUrl) {
      try {
        resolvedSlipUrl = await this.getSlipDataUrl(slipFile, slipDataUrl);
      } catch (e) {}
    }

    if (resolvedSlipUrl && verification.transactionRef) {
      try {
        localStorage.setItem(`cloud_slip_${verification.transactionRef}`, resolvedSlipUrl);
      } catch (storageErr) {}
    }

    // If slip was already credited to this user in a previous step, avoid duplicate credit & return current balance
    if (verification.alreadyCredited) {
      console.log('⚠️ Slip already credited to this user, returning duplicate status...');
      if (window.updateUserBalanceDisplays) window.updateUserBalanceDisplays();
      return {
        success: true,
        status: 'already_credited',
        alreadyCredited: true,
        duplicate: true,
        amount: verification.verifiedAmount || amount,
        transactionRef: verification.transactionRef,
        gateway: verification.gateway,
        bankName: verification.bankName,
        balanceAfter: verification.balanceAfter !== undefined ? verification.balanceAfter : (user ? user.balance : 0),
        message: verification.message
      };
    }

    // If verification status is PENDING (Awaiting admin manual check):
    // ZERO POINTS CREDITED! Strictly queue for admin review!
    if (verification.status === 'pending') {
      console.log('⏳ Topup is PENDING admin verification. No free balance credited.');
      return {
        success: true,
        status: 'pending',
        pending: true,
        amount: verification.verifiedAmount || amount,
        transactionRef: verification.transactionRef,
        gateway: verification.gateway,
        bankName: verification.bankName,
        message: verification.message
      };
    }

    // If verification status is APPROVED (Auto-verified via real bank network by server):
    // Server has already credited profiles.balance and recorded in wallet_transactions
    return {
      success: true,
      status: 'approved',
      amount: verification.verifiedAmount || amount,
      balanceAfter: verification.balanceAfter || user.balance,
      transactionRef: verification.transactionRef,
      gateway: verification.gateway,
      bankName: verification.bankName
    };
  }
}

window.paymentGatewayEngine = new PaymentGatewayEngine();
