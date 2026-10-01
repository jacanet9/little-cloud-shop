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
    this.currentSlipMode = 'qr';
    this.mobileSlipSessionId = null;
    this.mobileSlipPollingTimer = null;
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
   * Generates Thai QR PromptPay (EMVCo Official Standard)
   * Scannable by all Thai mobile banking apps (K PLUS, SCB Easy, Krungthai NEXT, etc.)
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

    // Reset slip file UI
    const slipLabel = document.getElementById('topup-slip-filename');
    if (slipLabel) {
      slipLabel.textContent = 'คลิกเพื่อเลือกไฟล์ (ไม่บังคับ)...';
      slipLabel.style.color = '#64748b';
    }

    // Show brief generation status
    Swal.fire({
      title: 'กำลังสร้าง QR Code พร้อมเพย์...',
      text: 'ระบบกำลังสร้าง Thai QR Payment (EMVCo) สำหรับบัญชีของคุณ',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#151622',
      color: '#fff'
    });

    try {
      const ppConfig = await this.getPromptPaySettings();
      const cleanNumber = (ppConfig.promptpayNumber || '0815993194').replace(/[^0-9]/g, '');
      const refId = `PP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

      // Generate standard EMVCo payload
      const emvPayload = generatePromptPayPayload(cleanNumber, amount);

      // Primary QR image via promptpay.io, fallback via qrserver with EMVCo string
      const primaryQrUrl = `https://promptpay.io/${cleanNumber}/${amount}.png`;
      const fallbackQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=8&data=${encodeURIComponent(emvPayload)}`;

      this.activeChargeId = refId;
      Swal.close();

      // Format phone number for display (e.g. 081-599-3194)
      let formattedPhone = cleanNumber;
      if (cleanNumber.length === 10) {
        formattedPhone = `${cleanNumber.substring(0, 3)}-${cleanNumber.substring(3, 6)}-${cleanNumber.substring(6)}`;
      } else if (cleanNumber.length === 13) {
        formattedPhone = `${cleanNumber.substring(0, 1)}-${cleanNumber.substring(1, 5)}-${cleanNumber.substring(5, 10)}-${cleanNumber.substring(10, 12)}-${cleanNumber.substring(12)}`;
      }

      // Render QR Code Result Box
      const resultBox = document.getElementById('topup-qr-result-box');
      const qrImg = document.getElementById('topup-generated-qr');
      const qrAmountVal = document.getElementById('topup-qr-amount-val');
      const qrReceiverName = document.getElementById('topup-qr-receiver-name');
      const qrPhone = document.getElementById('topup-qr-phone-number');
      const qrChargeBadge = document.getElementById('topup-charge-id-badge');

      if (qrReceiverName) qrReceiverName.textContent = ppConfig.promptpayName || 'Little Cloud Shop Official';
      if (qrPhone) qrPhone.textContent = formattedPhone;
      if (qrChargeBadge) qrChargeBadge.textContent = `REF: ${refId}`;
      if (qrAmountVal) qrAmountVal.textContent = `฿ ${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

      if (qrImg) {
        qrImg.src = primaryQrUrl;
        qrImg.onerror = () => {
          if (typeof QRCode !== 'undefined') {
            const parent = qrImg.parentElement;
            if (parent) {
              parent.innerHTML = '';
              new QRCode(parent, {
                text: emvPayload,
                width: 230,
                height: 230,
                colorDark: "#003b71",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
              });
              return;
            }
          }
          qrImg.src = fallbackQrUrl;
        };
      }

      if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Start Mobile Slip Upload QR Session & Real-Time Listener
      this.resetSlipSelection();

      // 15-Minute Countdown Timer & Local status poller
      this.startCountdownTimer(900);
      this.startStatusPolling(refId);

    } catch (err) {
      console.error('PromptPay QR Error:', err);
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
            await this.handlePaymentCompleted({
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
              await this.handlePaymentCompleted({
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
    this.stopMobileSlipPolling();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    const resultBox = document.getElementById('topup-qr-result-box');
    if (resultBox) resultBox.style.display = 'none';
  }

  /**
   * Convert Data URL (Base64) to HTML5 File Object
   */
  dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename || 'mobile_slip.jpg', { type: mime });
  }

  /**
   * Render QR Code to DOM container (using local QRCode JS first, then fallback)
   */
  renderQrCode(targetEl, textUrl) {
    if (!targetEl) return;
    targetEl.innerHTML = '';

    if (typeof QRCode !== 'undefined') {
      try {
        new QRCode(targetEl, {
          text: textUrl,
          width: 170,
          height: 170,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
        return;
      } catch (err) {
        console.warn('QRCode JS local render error:', err);
      }
    }

    // Fallback img
    const img = document.createElement('img');
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=4&data=${encodeURIComponent(textUrl)}`;
    img.style.width = '170px';
    img.style.height = '170px';
    img.style.display = 'block';
    img.style.margin = '0 auto';
    img.style.objectFit = 'contain';
    img.alt = 'Mobile Slip Upload QR';
    img.onerror = () => {
      img.src = `https://quickchart.io/qr?size=240&text=${encodeURIComponent(textUrl)}`;
    };
    targetEl.appendChild(img);
  }

  /**
   * Start Mobile QR Slip Upload Session & Poll for Image
   */
  async startMobileSlipSession() {
    this.stopMobileSlipPolling();
    this.mobileSlipSessionId = null;

    const qrTarget = document.getElementById('slip-upload-qr-target');
    const directLink = document.getElementById('slip-upload-direct-link');
    const sessionBadge = document.getElementById('slip-qr-session-badge');
    const urlHint = document.getElementById('slip-qr-url-hint');

    if (qrTarget) {
      qrTarget.innerHTML = `
        <div style="color: #94a3b8; font-size: 0.8rem; display: flex; flex-direction: column; align-items: center; gap: 8px;">
          <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: #e11d48;"></i>
          <span>กำลังสร้าง QR Code...</span>
        </div>
      `;
    }

    // Support both local server, live-server and file:/// protocol
    let apiBase = '';
    if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000')) {
      apiBase = 'http://127.0.0.1:3000';
    }

    let sessionId = `slip_${Date.now()}`;
    let uploadUrl = `http://192.168.1.124:3000/upload-slip.html?session=${sessionId}`;
    let localUrl = `http://127.0.0.1:3000/upload-slip.html?session=${sessionId}`;

    try {
      const resp = await fetch(`${apiBase}/api/slip/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success) {
          sessionId = data.session_id;
          uploadUrl = data.upload_url || uploadUrl;
          localUrl = data.local_url || localUrl;
        }
      }
    } catch (e) {
      console.warn('Mobile slip session API error, using local fallback:', e);
    }

    this.mobileSlipSessionId = sessionId;

    // Render QR Code immediately into target box
    if (qrTarget) {
      this.renderQrCode(qrTarget, uploadUrl);
    }

    if (directLink) {
      directLink.href = localUrl || uploadUrl;
    }

    if (sessionBadge) {
      sessionBadge.textContent = `#${sessionId.substring(0, 16)}`;
    }

    if (urlHint) {
      urlHint.textContent = uploadUrl.replace('http://', '');
    }

    // Start Polling for Mobile Upload (every 1.2s for instant response)
    this.mobileSlipPollingTimer = setInterval(async () => {
      if (!this.mobileSlipSessionId) {
        this.stopMobileSlipPolling();
        return;
      }

      try {
        let chkResp = await fetch(`${apiBase}/api/slip/check/${this.mobileSlipSessionId}`);
        if (!chkResp.ok && apiBase !== 'http://127.0.0.1:3000') {
          // Fallback check to port 3000
          chkResp = await fetch(`http://127.0.0.1:3000/api/slip/check/${this.mobileSlipSessionId}`);
        }
        if (chkResp.ok) {
          const chkData = await chkResp.json();
          if (chkData.success && chkData.status === 'completed' && chkData.slip_data) {
            this.stopMobileSlipPolling();
            this.handleMobileSlipReceived(chkData.slip_data, chkData.filename || 'mobile_slip.jpg');
          }
        }
      } catch (pollErr) {}
    }, 1200);
  }

  stopMobileSlipPolling() {
    if (this.mobileSlipPollingTimer) {
      clearInterval(this.mobileSlipPollingTimer);
      this.mobileSlipPollingTimer = null;
    }
  }

  handleMobileSlipReceived(dataUrl, filename) {
    const file = this.dataURLtoFile(dataUrl, filename);
    this.selectedSlipFile = file;

    // Update UI elements
    const badge = document.getElementById('topup-slip-badge');
    const filenameLabel = document.getElementById('topup-slip-filename');
    const previewContainer = document.getElementById('topup-slip-preview-container');
    const previewImg = document.getElementById('topup-slip-preview');
    const qrPanel = document.getElementById('slip-mode-qr-panel');
    const pcPanel = document.getElementById('slip-mode-pc-panel');

    if (badge) {
      badge.textContent = '✅ แนบสลิปผ่านมือถือแล้ว';
      badge.style.background = '#dcfce7';
      badge.style.color = '#15803d';
    }

    if (filenameLabel) {
      filenameLabel.textContent = `📱 ${filename} (${(file.size / 1024).toFixed(1)} KB)`;
      filenameLabel.style.color = '#059669';
      filenameLabel.style.fontWeight = '700';
    }

    if (previewImg && previewContainer) {
      previewImg.src = dataUrl;
      previewContainer.style.display = 'block';
    }

    if (qrPanel) qrPanel.style.display = 'none';
    if (pcPanel) pcPanel.style.display = 'none';

    Swal.fire({
      icon: 'success',
      title: '🎉 ได้รับสลิปจากมือถือแล้ว!',
      html: `
        <div style="text-align: left; padding: 6px 0; color: #cbd5e1; font-size: 0.9rem;">
          <p style="margin-bottom: 6px;">ระบบดึงภาพสลิปจากโทรศัพท์ของคุณเรียบร้อยแล้ว</p>
          <p style="color: #34d399; font-weight: 700;">พร้อมให้คุณกด "ตรวจสอบสลิปและเพิ่มเครดิตทันที" ด้านล่างได้เลยครับ ✨</p>
        </div>
      `,
      timer: 3500,
      showConfirmButton: true,
      confirmButtonText: 'ตกลง',
      confirmButtonColor: '#e11d48',
      background: '#151622',
      color: '#fff'
    });
  }

  resetSlipSelection() {
    this.selectedSlipFile = null;
    const badge = document.getElementById('topup-slip-badge');
    const filenameLabel = document.getElementById('topup-slip-filename');
    const previewContainer = document.getElementById('topup-slip-preview-container');
    const fileInput = document.getElementById('topup-slip-input');

    if (badge) {
      badge.textContent = 'ยังไม่ได้แนบ';
      badge.style.background = '#e2e8f0';
      badge.style.color = '#475569';
    }
    if (filenameLabel) {
      filenameLabel.textContent = 'ยังไม่มีรูปสลิป';
      filenameLabel.style.color = '#64748b';
    }
    if (previewContainer) {
      previewContainer.style.display = 'none';
    }
    if (fileInput) {
      fileInput.value = '';
    }

    // Restore active tab panel
    this.switchSlipUploadMode(this.currentSlipMode || 'qr');
  }

  switchSlipUploadMode(mode) {
    this.currentSlipMode = mode;
    const tabQr = document.getElementById('tab-slip-qr');
    const tabPc = document.getElementById('tab-slip-pc');
    const qrPanel = document.getElementById('slip-mode-qr-panel');
    const pcPanel = document.getElementById('slip-mode-pc-panel');

    if (mode === 'qr') {
      if (tabQr) { tabQr.classList.add('active'); tabQr.style.background = '#e11d48'; tabQr.style.color = '#fff'; tabQr.style.borderColor = '#e11d48'; }
      if (tabPc) { tabPc.classList.remove('active'); tabPc.style.background = '#f1f5f9'; tabPc.style.color = '#475569'; tabPc.style.borderColor = '#cbd5e1'; }
      if (qrPanel) qrPanel.style.display = 'block';
      if (pcPanel) pcPanel.style.display = 'none';
      if (!this.mobileSlipSessionId) {
        this.startMobileSlipSession();
      }
    } else {
      if (tabPc) { tabPc.classList.add('active'); tabPc.style.background = '#e11d48'; tabPc.style.color = '#fff'; tabPc.style.borderColor = '#e11d48'; }
      if (tabQr) { tabQr.classList.remove('active'); tabQr.style.background = '#f1f5f9'; tabQr.style.color = '#475569'; tabQr.style.borderColor = '#cbd5e1'; }
      if (qrPanel) qrPanel.style.display = 'none';
      if (pcPanel) pcPanel.style.display = 'block';
      this.stopMobileSlipPolling();
    }
  }

  handleSlipSelected(input) {
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.selectedSlipFile = file;

      const filenameLabel = document.getElementById('topup-slip-filename');
      const badge = document.getElementById('topup-slip-badge');
      const previewContainer = document.getElementById('topup-slip-preview-container');
      const previewImg = document.getElementById('topup-slip-preview');
      const qrPanel = document.getElementById('slip-mode-qr-panel');
      const pcPanel = document.getElementById('slip-mode-pc-panel');

      if (filenameLabel) {
        filenameLabel.textContent = `💻 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        filenameLabel.style.color = '#059669';
        filenameLabel.style.fontWeight = '700';
      }

      if (badge) {
        badge.textContent = '✅ แนบสลิปแล้ว';
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
      }

      if (previewContainer && previewImg) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
          previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }

      if (qrPanel) qrPanel.style.display = 'none';
      if (pcPanel) pcPanel.style.display = 'none';
    }
  }

  async confirmPaymentSimulation() {
    const user = window.authManager.currentUser;
    if (!user) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเข้าสู่ระบบ',
        text: 'คุณต้องเข้าสู่ระบบหรือสมัครสมาชิกก่อนทำการเติมเงิน',
        background: '#151622',
        color: '#fff',
        confirmButtonColor: '#e11d48'
      });
      return;
    }

    const amount = Number(this.currentAmount) || 0;
    if (amount <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุจำนวนเงิน',
        text: 'ยอดเงินที่เติมต้องมากกว่า 0 บาท',
        background: '#151622',
        color: '#fff'
      });
      return;
    }

    // STRICT VALIDATION: You CANNOT pass without uploading a genuine bank slip!
    if (!this.selectedSlipFile) {
      Swal.fire({
        icon: 'warning',
        title: 'ยังไม่ได้แนบสลิปการโอนเงิน',
        html: `
          <div style="text-align: left; padding: 6px 0; color: #cbd5e1; font-size: 0.9rem; line-height: 1.6;">
            <p style="margin-bottom: 8px; color: #f87171; font-weight: 700;">
              ❌ ไม่สามารถทำรายการได้เนื่องจากยังไม่มีหลักฐานการโอนเงิน
            </p>
            <p style="margin-bottom: 8px;">ระบบมีระบบตรวจสอบสลิปอัตโนมัติ กรุณาโอนเงินผ่านแอปธนาคาร แล้วแนบรูปภาพสลิปจริงก่อนกดยืนยัน</p>
            <div style="background: #1e2030; border: 1px solid #33364d; border-radius: 8px; padding: 10px; margin-top: 8px;">
              <b style="color: #f472b6;">ขั้นตอน:</b>
              <ol style="margin: 4px 0 0; padding-left: 18px; color: #a5a8bc; font-size: 0.85rem;">
                <li>สแกน QR Code พร้อมเพย์ด้านบนและโอนเงิน</li>
                <li>คลิกที่กล่อง <b>"แนบรูปสลิปหลักฐานการโอน"</b></li>
                <li>เลือกรูปภาพสลิปที่ได้จากแอปธนาคาร</li>
                <li>กดปุ่มยืนยันอีกครั้งเพื่อให้ระบบตรวจสอบ QR Code บนสลิป</li>
              </ol>
            </div>
          </div>
        `,
        background: '#151622',
        color: '#fff',
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'ไปแนบรูปสลิปโอนเงิน'
      });

      const dropzone = document.getElementById('slip-mode-qr-panel') || document.getElementById('slip-mode-pc-panel');
      if (dropzone) {
        dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // Show Scanning / Verification Spinner
    Swal.fire({
      title: 'กำลังสแกนและตรวจสอบสลิป...',
      html: `
        <div style="padding: 10px; text-align: center;">
          <p style="color: #a5a8bc; font-size: 0.88rem; margin-bottom: 8px;">
            ระบบกำลังอ่าน QR Code ธนาคาร ตรวจสอบความถูกต้อง และป้องกันการใช้สลิปซ้ำ
          </p>
          <div style="color: #f472b6; font-weight: 700; font-size: 1.1rem;">
            ยอดเงินที่ระบุ: ฿ ${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
          </div>
        </div>
      `,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#151622',
      color: '#fff'
    });

    try {
      // Process full topup pipeline with real slip inspection
      const result = await window.paymentGatewayEngine.processTopupPipeline({
        amount: amount,
        slipFile: this.selectedSlipFile
      });

      await this.handlePaymentCompleted({
        amount: result.amount || amount,
        chargeId: result.transactionRef || result.referenceId || `PAY-${Date.now()}`,
        balanceAfter: result.balanceAfter
      });
    } catch (err) {
      console.error('Topup verification failed:', err);
      Swal.fire({
        icon: 'error',
        title: 'การตรวจสอบสลิปไม่ผ่าน',
        text: err.message || 'เกิดข้อผิดพลาดในการตรวจสอบสลิป กรุณาตรวจสอบว่ารูปภาพเป็นสลิปโอนเงินจริงของธนาคาร',
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
