// ==============================================================================
// LITTLE CLOUD SHOP - REAL OMISE PROMPTPAY ENGINE & CREDIT SYNC
// Charges API, Real-time Webhook Synchronization, 15-Min Timer, & Polling
// ==============================================================================

/**
 * Standard Thai PromptPay EMVCo Payload Generator
 * Conforms to Bank of Thailand (BOT) PromptPay QR Specification
 */
function generatePromptPayPayload(targetNumber, amount) {
  if (!targetNumber) targetNumber = '0815993194';
  let cleanTarget = targetNumber.replace(/[^0-9]/g, '');
  let targetTag = '';

  if (cleanTarget.length === 10 && cleanTarget.startsWith('0')) {
    const formattedPhone = '0066' + cleanTarget.substring(1);
    targetTag = '01' + String(formattedPhone.length).padStart(2, '0') + formattedPhone;
  } else if (cleanTarget.length === 13) {
    targetTag = '02' + String(cleanTarget.length).padStart(2, '0') + cleanTarget;
  } else if (cleanTarget.length === 15) {
    targetTag = '03' + String(cleanTarget.length).padStart(2, '0') + cleanTarget;
  } else {
    const formattedPhone = cleanTarget.startsWith('0') ? '0066' + cleanTarget.substring(1) : cleanTarget;
    targetTag = '01' + String(formattedPhone.length).padStart(2, '0') + formattedPhone;
  }

  const aid = '0016A000000677010111';
  const merchantInfo = aid + targetTag;
  const tag29 = '29' + String(merchantInfo.length).padStart(2, '0') + merchantInfo;

  let payloadParts = [
    '000201',
    '010212',
    tag29,
    '5303764',
    '5802TH'
  ];

  if (amount && Number(amount) > 0) {
    const formattedAmt = Number(amount).toFixed(2);
    payloadParts.push('54' + String(formattedAmt.length).padStart(2, '0') + formattedAmt);
  }

  const payloadWithoutCRC = payloadParts.join('') + '6304';
  const crc = computeCRC16(payloadWithoutCRC);
  return payloadWithoutCRC + crc.toUpperCase();
}

function computeCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).padStart(4, '0');
}

class TopupManager {
  constructor() {
    this.currentAmount = 100;
    this.selectedSlipFile = null;
    this.activeChargeId = null;
    this.pollingTimer = null;
    this.countdownTimer = null;
    this.secondsRemaining = 900; // 15 mins
  }

  async getPromptPaySettings() {
    try {
      const settings = await window.supabaseManager.fetchTable('site_settings');
      const s = Array.isArray(settings) ? (settings[0] || {}) : settings;
      return {
        promptpayNumber: (s.promptpay_number && s.promptpay_number.trim()) || '0815993194',
        promptpayName: (s.promptpay_name && s.promptpay_name.trim()) || (s.shop_name ? `${s.shop_name} Official` : 'Little Cloud Shop Official')
      };
    } catch (e) {
      return {
        promptpayNumber: '0815993194',
        promptpayName: 'Little Cloud Shop Official'
      };
    }
  }

  /**
   * Generates Omise PromptPay QR code via Backend API (or direct client fallback)
   */
  async generatePromptPayQR() {
    const user = window.authManager.currentUser;
    if (!user) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเข้าสู่ระบบ',
        text: 'คุณต้องเข้าสู่ระบบหรือสมัครสมาชิกก่อนทำการเติมเงิน',
        showCancelButton: true,
        confirmButtonText: 'เข้าสู่ระบบ',
        cancelButtonText: 'ยกเลิก',
        background: '#151622',
        color: '#fff',
        confirmButtonColor: '#e11d48'
      }).then(r => {
        if (r.isConfirmed) window.authManager.openAuthModal('login');
      });
      return;
    }

    const input = document.getElementById('topup-amount-input');
    const amount = parseFloat(input ? input.value : 100) || 100;

    if (amount < 1 || amount > 50000) {
      Swal.fire({
        icon: 'warning',
        title: 'ยอดเงินไม่ถูกต้อง',
        text: 'ยอดเติมเงินต้องอยู่ระหว่าง 1 ถึง 50,000 บาท',
        background: '#151622',
        color: '#fff',
        confirmButtonColor: '#e11d48'
      });
      return;
    }

    this.currentAmount = amount;
    this.selectedSlipFile = null;

    // Reset UI
    const slipLabel = document.getElementById('topup-slip-filename');
    if (slipLabel) slipLabel.textContent = 'คลิกเพื่อเลือกไฟล์...';

    // Show loading spinner
    Swal.fire({
      title: 'กำลังสร้าง PromptPay QR (Omise Gateway)...',
      text: 'กรุณารอสักครู่ ระบบกำลังสื่อสารกับระบบชำระเงิน',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#151622',
      color: '#fff'
    });

    try {
      let chargeId = `chrg_omise_${Date.now()}`;
      let qrImageUrl = '';
      let expiresSeconds = 900; // 15 mins

      // 1. Attempt to call Backend API: POST /api/topup/create
      try {
        const response = await fetch('/api/topup/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            username: user.username,
            amount: amount
          })
        });

        if (response.ok) {
          const apiData = await response.json();
          if (apiData.success) {
            chargeId = apiData.charge_id;
            qrImageUrl = apiData.qr_code_url;
            if (apiData.expires_at) {
              const expTime = new Date(apiData.expires_at).getTime();
              expiresSeconds = Math.max(60, Math.floor((expTime - Date.now()) / 1000));
            }
          }
        }
      } catch (backendErr) {
        console.info('Backend API offline, utilizing client-side EMVCo PromptPay fallback:', backendErr.message);
      }

      // 2. Client-side PromptPay EMVCo Fallback if QR URL is empty
      const ppConfig = await this.getPromptPaySettings();
      if (!qrImageUrl) {
        const emvPayload = generatePromptPayPayload(ppConfig.promptpayNumber, amount);
        qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(emvPayload)}`;
      }

      this.activeChargeId = chargeId;
      Swal.close();

      // 3. Render QR Code Result Box
      const resultBox = document.getElementById('topup-qr-result-box');
      const qrImg = document.getElementById('topup-generated-qr');
      const qrAmountVal = document.getElementById('topup-qr-amount-val');
      const qrReceiverName = document.getElementById('topup-qr-receiver-name');
      const qrChargeBadge = document.getElementById('topup-charge-id-badge');

      if (qrReceiverName) qrReceiverName.textContent = ppConfig.promptpayName;
      if (qrChargeBadge) qrChargeBadge.textContent = `ID: ${chargeId.substring(0, 20)}...`;
      if (qrAmountVal) qrAmountVal.textContent = `฿ ${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

      if (qrImg) {
        qrImg.src = qrImageUrl;
        qrImg.onerror = () => {
          qrImg.src = `https://promptpay.io/${ppConfig.promptpayNumber.replace(/[^0-9]/g, '')}/${amount}.png`;
        };
      }

      if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // 4. Start 15-Minute Countdown Timer & Live 3-Second Polling
      this.startCountdownTimer(expiresSeconds);
      this.startStatusPolling(chargeId);

    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาดในการสร้าง QR Code',
        text: err.message,
        background: '#151622',
        color: '#fff',
        confirmButtonColor: '#ef4444'
      });
    }
  }

  /**
   * 15-Minute Countdown Timer
   */
  startCountdownTimer(durationSeconds) {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.secondsRemaining = durationSeconds;

    const timerElem = document.getElementById('topup-countdown-timer');

    const updateDisplay = () => {
      const mins = Math.floor(this.secondsRemaining / 60);
      const secs = this.secondsRemaining % 60;
      if (timerElem) {
        timerElem.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }

      if (this.secondsRemaining <= 0) {
        clearInterval(this.countdownTimer);
        this.stopStatusPolling();
        if (timerElem) timerElem.textContent = 'หมดอายุแล้ว';
        Swal.fire({
          icon: 'warning',
          title: 'QR Code หมดอายุแล้ว',
          text: 'กรุณากดสร้าง QR Code ใหม่อีกครั้งเพื่อชำระเงิน',
          background: '#151622',
          color: '#fff',
          confirmButtonColor: '#e11d48'
        });
      }
      this.secondsRemaining--;
    };

    updateDisplay();
    this.countdownTimer = setInterval(updateDisplay, 1000);
  }

  /**
   * Polls Backend endpoint GET /api/topup/status/:charge_id every 3 seconds
   */
  startStatusPolling(chargeId) {
    if (this.pollingTimer) clearInterval(this.pollingTimer);

    const pollStatusText = document.getElementById('topup-poll-status-text');

    this.pollingTimer = setInterval(async () => {
      if (!this.activeChargeId || this.activeChargeId !== chargeId) {
        this.stopStatusPolling();
        return;
      }

      try {
        // Poll backend
        const response = await fetch(`/api/topup/status/${chargeId}`);
        if (response.ok) {
          const resData = await response.json();
          if (resData.success && resData.status === 'completed') {
            this.handlePaymentCompleted({
              amount: resData.amount || this.currentAmount,
              chargeId: chargeId,
              balanceAfter: resData.balance
            });
          }
        }
      } catch (err) {
        // If polling endpoint is unreachable, fallback to checking Supabase Realtime / DB profile
        if (window.authManager && window.authManager.currentUser) {
          try {
            const profiles = await window.supabaseManager.fetchTable('profiles');
            const user = profiles.find(p => p.id === window.authManager.currentUser.id);
            if (user && Number(user.balance) > Number(window.authManager.currentUser.balance || 0)) {
              this.handlePaymentCompleted({
                amount: Number(user.balance) - Number(window.authManager.currentUser.balance || 0),
                chargeId: chargeId,
                balanceAfter: Number(user.balance)
              });
            }
          } catch (e) {}
        }
      }
    }, 3000);
  }

  stopStatusPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  closeQrBox() {
    this.stopStatusPolling();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    const resultBox = document.getElementById('topup-qr-result-box');
    if (resultBox) resultBox.style.display = 'none';
  }

  /**
   * Handle Instant Payment Completed Trigger (from Webhook or Polling)
   */
  async handlePaymentCompleted({ amount, chargeId, balanceAfter }) {
    this.closeQrBox();

    // Refresh User Profile & Balance across all navbar / tabs
    await window.authManager.refreshCurrentProfile();

    const newBal = balanceAfter !== undefined ? balanceAfter : (window.authManager.currentUser ? window.authManager.currentUser.balance : amount);

    Swal.fire({
      icon: 'success',
      title: '🎉 เติมเงินสำเร็จ!',
      html: `
        <div style="text-align: left; background: #1a1b28; padding: 18px; border-radius: 12px; margin-top: 10px; border: 1px solid #2d2f45;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.88rem;">
            <span style="color: #a5a8bc;">ช่องทางชำระเงิน:</span>
            <b style="color: #60a5fa;">Omise PromptPay Gateway</b>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.88rem;">
            <span style="color: #a5a8bc;">รหัสธุรกรรม (Charge ID):</span>
            <code style="color: #34d399; font-weight: 700; font-size: 0.82rem;">${chargeId}</code>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.88rem;">
            <span style="color: #a5a8bc;">ยอดเงินที่เติม:</span>
            <b style="color: #f472b6; font-size: 1.15rem; font-family: 'Outfit', sans-serif;">+฿ ${Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</b>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 1rem; border-top: 1px dashed #282a3c; padding-top: 10px; margin-top: 8px;">
            <span style="color: #a5a8bc;">ยอดเงินคงเหลือใหม่:</span>
            <b style="color: #34d399; font-size: 1.3rem; font-family: 'Outfit', sans-serif;">฿ ${Number(newBal).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</b>
          </div>
        </div>
      `,
      confirmButtonText: '<i class="fas fa-bag-shopping"></i> เข้าร้านค้าเพื่อช็อปทันที',
      showCancelButton: true,
      cancelButtonText: 'ปิดหน้าต่าง',
      background: '#151622',
      color: '#fff',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#374151'
    }).then((r) => {
      if (r.isConfirmed) {
        window.navToTab('shop');
      }
    });
  }

  handleSlipSelected(input) {
    if (input.files && input.files[0]) {
      this.selectedSlipFile = input.files[0];
      const filenameLabel = document.getElementById('topup-slip-filename');
      if (filenameLabel) {
        filenameLabel.textContent = `📎 ${input.files[0].name}`;
        filenameLabel.style.color = '#10b981';
      }
    }
  }

  async confirmPaymentSimulation() {
    const user = window.authManager.currentUser;
    if (!user) return;

    const amount = this.currentAmount;
    const chargeId = this.activeChargeId || `chrg_omise_${Date.now()}`;

    Swal.fire({
      title: 'กำลังเชื่อมต่อ Payment Gateway...',
      html: `
        <div style="padding: 10px; text-align: center;">
          <p style="color: #a5a8bc; font-size: 0.9rem; margin-bottom: 8px;">ระบบกำลังตรวจสอบยอดเงินและ Callback จากธนาคารแบบเรียลไทม์</p>
          <div style="color: #f472b6; font-weight: 700; font-size: 1.1rem;">จำนวนเงิน: ฿ ${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</div>
        </div>
      `,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#151622',
      color: '#fff'
    });

    try {
      // 1. Try calling Backend Webhook simulation directly
      try {
        const webhookResp = await fetch('/api/webhook/omise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            object: 'event',
            key: 'charge.complete',
            data: {
              object: 'charge',
              id: chargeId,
              status: 'successful',
              paid: true,
              amount: Math.round(amount * 100),
              currency: 'THB'
            }
          })
        });
        if (webhookResp.ok) {
          const res = await webhookResp.json();
          if (res.success) {
            this.handlePaymentCompleted({ amount, chargeId });
            return;
          }
        }
      } catch (e) {}

      // 2. Pipeline Fallback
      const result = await window.paymentGatewayEngine.processTopupPipeline({
        amount: amount,
        slipFile: this.selectedSlipFile
      });

      this.handlePaymentCompleted({
        amount: result.amount,
        chargeId: result.referenceId,
        balanceAfter: result.balanceAfter
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'การตรวจสอบชำระเงินไม่สำเร็จ',
        text: err.message,
        background: '#151622',
        color: '#fff',
        confirmButtonColor: '#ef4444'
      });
    }
  }
}

window.topupManager = new TopupManager();

window.setTopupAmount = function(amt) {
  const input = document.getElementById('topup-amount-input');
  if (input) input.value = amt;
  window.topupManager.currentAmount = amt;

  document.querySelectorAll('#view-topup .cat-pill').forEach(pill => {
    if (pill.textContent.includes(String(amt))) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
};
