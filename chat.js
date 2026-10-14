// ==============================================================================
// LITTLE CLOUD SHOP - REAL CUSTOMER-TO-ADMIN LIVE CHAT ENGINE
// Real-time Order Chat, Instant Support, Image Attachments & Left/Right Dialogue
// ==============================================================================

class ChatManager {
  constructor() {
    this.activeOrderId = null;
    this.activeProductName = '';
    this.activeDeliveryCode = '';
    this.activeMessages = [];
    this.pollingTimer = null;
    this.isChatOpen = false;
    this.unreadCount = 0;
    this.selectedAttachmentData = null;
    this.adminActiveOrderId = null;
    this.adminPollingTimer = null;

    this.bindGlobalEvents();
  }

  getApiBaseUrl() {
    if (window.location.protocol === 'file:') {
      return 'http://127.0.0.1:3000';
    }
    return '';
  }

  bindGlobalEvents() {
    // Escape key closes customer chat if open
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isChatOpen) {
        this.closeChat();
      }
    });
  }

  /**
   * Open Chat for a specific order right after purchase (or from order history / skin inquiry / floating button)
   */
  async openChatForOrder(orderId = null, productName = '', deliveryCode = '', customerUsername = '', orderStatus = '') {
    const user = window.authManager ? window.authManager.currentUser : null;
    if (!user) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'warning',
          title: 'กรุณาเข้าสู่ระบบ',
          text: 'กรุณาเข้าสู่ระบบก่อนใช้งานระบบแชท',
          background: '#151622',
          color: '#fff',
          confirmButtonColor: '#e11d48'
        });
      }
      return;
    }

    const isAdmin = (user.role === 'admin');
    this.isAdminViewing = isAdmin;

    // Reset messages memory list when opening a new chat session to prevent cross-user message leaks
    this.activeMessages = [];

    // Determine customer username and order ID
    if (isAdmin) {
      this.activeCustomerUsername = customerUsername || 'ลูกค้า FiveM';
      this.activeOrderId = orderId || (customerUsername ? `inquiry_${customerUsername.toLowerCase()}` : 'general');
      this.activeOrderStatus = orderStatus || (orderId ? 'completed' : 'inquiry');
    } else {
      this.activeCustomerUsername = user.username || 'member';
      this.activeOrderId = orderId || `inquiry_${(user.username || 'member').toLowerCase()}`;
      this.activeOrderStatus = orderStatus || (orderId ? 'completed' : 'inquiry');
    }

    this.activeProductName = productName || 'ฝ่ายบริการลูกค้า';
    this.activeDeliveryCode = deliveryCode || '';
    this.unreadCount = 0;
    this.updateUnreadBadge();

    // Show Chat Window
    const chatModal = document.getElementById('modal-order-chat');
    if (chatModal) {
      chatModal.style.display = 'flex';
      this.isChatOpen = true;
    }

    // Update Header Context (Clarify Member vs Admin Support)
    const headerTitle = document.getElementById('chat-header-title-text');
    const userDisplayWrapper = document.getElementById('chat-header-user-wrapper');
    const orderTitle = document.getElementById('chat-order-product-name');
    const orderRef = document.getElementById('chat-order-ref-badge');
    const statusBadge = document.getElementById('chat-order-status-badge');
    const quickActionsBar = document.getElementById('chat-quick-actions-bar');
    const chatInput = document.getElementById('chat-message-input');

    if (headerTitle) {
      headerTitle.textContent = isAdmin ? 'ห้องสนทนากับลูกค้า (Admin)' : 'แอดมิน Little Cloud (Support)';
    }

    if (userDisplayWrapper) {
      if (isAdmin) {
        userDisplayWrapper.innerHTML = `ลูกค้า: <b id="chat-header-user-display" style="color: #38bdf8;">${this.activeCustomerUsername}</b> <span id="chat-header-role-badge" style="font-size: 0.62rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 1px 5px; border-radius: 4px; font-weight: 700;">Customer</span>`;
      } else {
        userDisplayWrapper.innerHTML = `คุยกับคุณ: <b id="chat-header-user-display" style="color: #fb7185;">${user.username}</b> <span id="chat-header-role-badge" style="font-size: 0.62rem; background: rgba(244, 114, 182, 0.15); color: #f472b6; padding: 1px 5px; border-radius: 4px; font-weight: 700;">Member</span>`;
      }
    }

    if (orderTitle) {
      orderTitle.textContent = this.activeProductName;
    }
    if (orderRef) {
      const displayRef = this.activeOrderId.startsWith('inquiry_') ? 'Inquiry' : this.activeOrderId;
      orderRef.textContent = `#${displayRef.substring(0, 18)}`;
    }

    // Update Status Badge dynamically based on actual payment/order state
    if (statusBadge) {
      const st = (this.activeOrderStatus || '').toLowerCase();
      if (st === 'completed' || st === 'paid' || st === 'approved') {
        statusBadge.innerHTML = '<i class="fas fa-check-circle"></i> ชำระแล้ว';
        statusBadge.style.cssText = 'font-size: 0.72rem; color: #10b981; background: rgba(16,185,129,0.12); padding: 3px 8px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;';
      } else if (st === 'pending' || st === 'waiting_payment') {
        statusBadge.innerHTML = '<i class="fas fa-clock"></i> รอชำระเงิน';
        statusBadge.style.cssText = 'font-size: 0.72rem; color: #f59e0b; background: rgba(245,158,11,0.12); padding: 3px 8px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;';
      } else if (st === 'cancelled' || st === 'rejected') {
        statusBadge.innerHTML = '<i class="fas fa-circle-xmark"></i> ยกเลิกแล้ว';
        statusBadge.style.cssText = 'font-size: 0.72rem; color: #ef4444; background: rgba(239,68,68,0.12); padding: 3px 8px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;';
      } else {
        // Inquiry / not paid yet
        statusBadge.innerHTML = '<i class="fas fa-info-circle"></i> สอบถามสินค้า (ยังไม่ชำระ)';
        statusBadge.style.cssText = 'font-size: 0.72rem; color: #38bdf8; background: rgba(56,189,248,0.12); padding: 3px 8px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;';
      }
    }

    // Quick Action Pills based on Role
    if (quickActionsBar) {
      if (isAdmin) {
        quickActionsBar.innerHTML = `
          <button type="button" class="chat-quick-pill-item" onclick="if(window.chatManager) window.chatManager.sendQuickMessage('แอดมินพร้อมส่งมอบสินค้าในเกม FiveM แล้วครับ รบกวนแจ้งเลข ID และจุดนัดพบในเมืองได้เลยครับ 🚗💨')">
            🚗 นัดส่งของในเกม FiveM
          </button>
          <button type="button" class="chat-quick-pill-item" onclick="if(window.chatManager) window.chatManager.sendQuickMessage('ทางแอดมินดำเนินการจัดส่งสินค้าในเกมให้คุณเรียบร้อยแล้วครับ ขอบคุณที่ใช้บริการ Little Cloud ครับ 💖')">
            ✅ ดำเนินการส่งมอบเรียบร้อย
          </button>
          <button type="button" class="chat-quick-pill-item" onclick="if(window.chatManager) window.chatManager.sendQuickMessage('รบกวนส่งรูปภาพหรือแจ้งรายละเอียดเพิ่มเติม เพื่อให้ทีมงานตรวจสอบได้เลยครับ ⚠️')">
            ⚠️ ขอข้อมูลเพิ่มเติม
          </button>
        `;
      } else {
        quickActionsBar.innerHTML = `
          <button type="button" class="chat-quick-pill-item" onclick="if(window.chatManager) window.chatManager.sendQuickMessage('สวัสดีครับแอดมิน สะดวกส่งของในเกม FiveM ไหมครับ')">
            🚗 นัดรับของในเกม
          </button>
          <button type="button" class="chat-quick-pill-item" onclick="if(window.chatManager) window.chatManager.sendQuickMessage('แจ้งปัญหาการใช้งาน / ขอความช่วยเหลือ')">
            ⚠️ แจ้งปัญหา
          </button>
        `;
      }
    }

    if (chatInput) {
      chatInput.placeholder = isAdmin ? `พิมพ์ข้อความตอบกลับคุณ ${this.activeCustomerUsername}...` : 'พิมพ์ข้อความคุยกับแอดมินที่นี่...';
    }

    // Clear and load messages
    await this.loadMessages();

    // Start Real-Time Live Polling (every 2.5 seconds)
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => this.loadMessages(true), 2500);

    // Focus input
    setTimeout(() => {
      if (chatInput) chatInput.focus();
    }, 150);
  }

  toggleChat() {
    if (this.isChatOpen) {
      this.closeChat();
    } else {
      const user = window.authManager ? window.authManager.currentUser : null;
      this.openChatForOrder(null, this.activeProductName || 'ฝ่ายบริการลูกค้า', this.activeDeliveryCode, (user ? user.username : 'member'), 'inquiry');
    }
  }

  closeChat() {
    const chatModal = document.getElementById('modal-order-chat');
    if (chatModal) {
      chatModal.style.display = 'none';
      this.isChatOpen = false;
    }
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Fetch and render messages for active order (combines local cache + backend)
   */
  async loadMessages(isSilent = false) {
    const user = window.authManager ? window.authManager.currentUser : null;
    if (!user || !this.activeOrderId) return;

    // Cache key is strictly partitioned by customer to prevent cross-account leaks
    const partitionUser = this.isAdminViewing ? (this.activeCustomerUsername || 'cust') : (user.username || 'member');
    const cacheKey = `lc_chat_${partitionUser.toLowerCase()}_${this.activeOrderId}`;

    // 1. Populate from local cache if memory list is currently empty
    if (this.activeMessages.length === 0) {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.activeMessages = parsed;
            this.renderMessages(isSilent);
          }
        } catch (e) { }
      }
    }

    // 2. Query Backend API
    try {
      const apiBase = this.getApiBaseUrl();
      const resp = await fetch(`${apiBase}/api/chat/messages?order_id=${encodeURIComponent(this.activeOrderId)}&username=${encodeURIComponent(this.activeCustomerUsername)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && Array.isArray(data.messages)) {
          const serverMsgs = data.messages;
          if (serverMsgs.length > 0) {
            const idMap = new Set(this.activeMessages.map(m => m.id));
            let hasNew = false;
            for (const sm of serverMsgs) {
              if (!idMap.has(sm.id)) {
                this.activeMessages.push(sm);
                idMap.add(sm.id);
                hasNew = true;
              }
            }
            if (hasNew || this.activeMessages.length !== serverMsgs.length) {
              this.activeMessages.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
              localStorage.setItem(cacheKey, JSON.stringify(this.activeMessages));
              this.renderMessages(isSilent);
            }
          }
        }
      }
    } catch (apiErr) {
      // Backend may be offline, local cache is preserved
    }

    // 3. If brand new conversation with zero messages, add welcome message
    if (this.activeMessages.length === 0) {
      const isInquiry = (this.activeOrderStatus === 'inquiry' || this.activeOrderId.startsWith('inquiry_'));
      let welcomeText = '';
      if (isInquiry) {
        welcomeText = `ยินดีต้อนรับครับคุณ ${this.activeCustomerUsername}! หากสนใจหรือมีคำถามเกี่ยวกับ "${this.activeProductName}" สามารถพิมพ์ข้อความสอบถามแอดมิน Little Cloud ได้เลยครับ ยินดีให้บริการตลอด 24 ชม. 💖`;
      } else {
        welcomeText = `ยินดีต้อนรับครับคุณ ${this.activeCustomerUsername}! ขอบคุณที่สั่งซื้อ "${this.activeProductName}" ทางแอดมิน Little Cloud พร้อมให้บริการส่งมอบสินค้าในเกม FiveM หรือช่วยเหลือคุณตลอด 24 ชม. สามารถพิมพ์ข้อความแจ้งแอดมินได้เลยครับ 💖`;
      }

      const welcomeMsg = {
        id: `sys_welcome_${Date.now()}`,
        order_id: this.activeOrderId,
        user_id: 'admin_sys',
        username: 'Admin Little Cloud',
        customer_username: this.activeCustomerUsername,
        sender_role: 'admin',
        message: welcomeText,
        product_name: this.activeProductName,
        delivery_code: this.activeDeliveryCode,
        created_at: new Date().toISOString()
      };

      this.activeMessages.push(welcomeMsg);
      localStorage.setItem(cacheKey, JSON.stringify(this.activeMessages));
      this.renderMessages(isSilent);

      // Asynchronously sync welcome message to backend
      try {
        const apiBase = this.getApiBaseUrl();
        fetch(`${apiBase}/api/chat/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(welcomeMsg)
        }).catch(() => { });
      } catch (e) { }
    } else if (this.activeMessages.length > 0) {
      this.renderMessages(isSilent);
    }
  }

  /**
   * Render message bubbles strictly matching design:
   * - Right side: "ME" (Current viewer: Member when logged in as member, Admin when logged in as admin)
   * - Left side: "OTHER" (When logged in as member -> Admin on left; When logged in as admin -> Customer on left)
   */
  renderMessages(isSilent = false) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    const user = window.authManager ? window.authManager.currentUser : null;
    const currentUsername = user ? (user.username || '').toLowerCase() : '';
    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 80;

    if (this.activeMessages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 50px 20px; color: #a5a8bc; margin: auto;">
          <div style="width: 54px; height: 54px; border-radius: 50%; background: #1c1e2d; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; color: #f472b6; font-size: 1.4rem;">
            <i class="fas fa-comments"></i>
          </div>
          <b style="color: #fff; font-size: 0.96rem;">เริ่มการสนทนา</b>
          <p style="font-size: 0.8rem; color: #64748b; margin-top: 6px;">พิมพ์ข้อความหรือกดปุ่มลัดด้านล่างเพื่อคุยได้ทันที</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.activeMessages.map(m => {
      const isMsgAdmin = (m.sender_role === 'admin');
      const isMsgSystem = (m.sender_role === 'system');

      // Determine if message belongs to ME (the current viewer)
      let isMe = false;
      if (this.isAdminViewing) {
        // If logged in as Admin: Admin messages are ME (right side)
        isMe = isMsgAdmin;
      } else {
        // If logged in as Customer: Customer messages with matching username or role are ME (right side)
        isMe = !isMsgAdmin && !isMsgSystem;
      }

      const dateObj = new Date(m.created_at || Date.now());
      const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      // ==============================================================
      // 1. ME (RIGHT SIDE: Black bubble, crisp outline, timestamp on left)
      // ==============================================================
      if (isMe) {
        const myLabel = this.isAdminViewing ? 'คุณ (แอดมิน)' : 'คุณ';
        return `
          <div class="chat-msg-row chat-msg-me" style="display: flex; justify-content: flex-end; align-items: flex-end; gap: 8px; margin-bottom: 14px;">
            <span style="font-size: 0.72rem; color: #64748b; margin-bottom: 4px; white-space: nowrap; flex-shrink: 0;">${timeStr}</span>
            <div style="max-width: 78%;">
              <div style="font-size: 0.68rem; color: #94a3b8; text-align: right; margin-bottom: 3px; font-weight: 600;">${myLabel}</div>
              <div style="background: #000000; border: 1.5px solid ${this.isAdminViewing ? '#e11d48' : '#2d3045'}; color: #ffffff; padding: 10px 15px; border-radius: 18px 18px 4px 18px; font-size: 0.88rem; line-height: 1.5; word-break: break-word; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);">
                ${m.message ? `<div>${this.escapeHtml(m.message)}</div>` : ''}
                ${m.attachment ? `
                  <div style="margin-top: 8px;">
                    <img src="${m.attachment}" alt="แนบรูปภาพ" style="max-width: 100%; max-height: 220px; border-radius: 10px; cursor: pointer; display: block; border: 1px solid rgba(255,255,255,0.15);" onclick="window.open('${m.attachment}', '_blank')">
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }

      // ==============================================================
      // 2. OTHER PARTY (LEFT SIDE: Avatar on left, dark neutral bubble, timestamp on right)
      // ==============================================================
      if (this.isAdminViewing) {
        // Other party is CUSTOMER
        const customerName = m.username || this.activeCustomerUsername || 'ลูกค้า FiveM';
        return `
          <div class="chat-msg-row chat-msg-customer" style="display: flex; justify-content: flex-start; align-items: flex-end; gap: 10px; margin-bottom: 14px;">
            <div style="width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #0284c7 0%, #38bdf8 100%); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.88rem; flex-shrink: 0; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.35); border: 2px solid #23263b;">
              <i class="fas fa-user"></i>
            </div>
            <div style="max-width: 76%;">
              <div style="font-size: 0.72rem; color: #38bdf8; font-weight: 700; margin-bottom: 3px; display: flex; align-items: center; gap: 5px;">
                <span>ลูกค้า: ${this.escapeHtml(customerName)}</span>
                <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.62rem; padding: 1px 5px; border-radius: 4px;">CUSTOMER</span>
              </div>
              <div style="display: flex; align-items: flex-end; gap: 8px;">
                <div style="background: #23263b; border: 1px solid rgba(255, 255, 255, 0.08); color: #f1f5f9; padding: 10px 14px; border-radius: 18px 18px 18px 4px; font-size: 0.88rem; line-height: 1.5; word-break: break-word; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);">
                  ${m.message ? `<div>${this.escapeHtml(m.message)}</div>` : ''}
                  ${m.attachment ? `
                    <div style="margin-top: 8px;">
                      <img src="${m.attachment}" alt="แนบรูปภาพ" style="max-width: 100%; max-height: 220px; border-radius: 10px; cursor: pointer; display: block; border: 1px solid rgba(255,255,255,0.1);" onclick="window.open('${m.attachment}', '_blank')">
                    </div>
                  ` : ''}
                </div>
                <span style="font-size: 0.72rem; color: #64748b; margin-bottom: 4px; white-space: nowrap; flex-shrink: 0;">${timeStr}</span>
              </div>
            </div>
          </div>
        `;
      }

      // Other party is ADMIN SUPPORT
      return `
        <div class="chat-msg-row chat-msg-admin" style="display: flex; justify-content: flex-start; align-items: flex-end; gap: 10px; margin-bottom: 14px;">
          <div style="width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #e11d48 0%, #fb7185 100%); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.88rem; flex-shrink: 0; box-shadow: 0 2px 8px rgba(225, 29, 72, 0.35); border: 2px solid #23263b;">
            <i class="fas fa-headset"></i>
          </div>
          <div style="max-width: 76%;">
            <div style="font-size: 0.72rem; color: #fb7185; font-weight: 700; margin-bottom: 3px; display: flex; align-items: center; gap: 5px;">
              <span>แอดมิน Little Cloud</span>
              <span style="background: rgba(244, 114, 182, 0.15); color: #f472b6; font-size: 0.62rem; padding: 1px 5px; border-radius: 4px;">SUPPORT</span>
            </div>
            <div style="display: flex; align-items: flex-end; gap: 8px;">
              <div style="background: #23263b; border: 1px solid rgba(255, 255, 255, 0.08); color: #f1f5f9; padding: 10px 14px; border-radius: 18px 18px 18px 4px; font-size: 0.88rem; line-height: 1.5; word-break: break-word; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);">
                ${m.message ? `<div>${this.escapeHtml(m.message)}</div>` : ''}
                ${m.attachment ? `
                  <div style="margin-top: 8px;">
                    <img src="${m.attachment}" alt="แนบรูปภาพ" style="max-width: 100%; max-height: 220px; border-radius: 10px; cursor: pointer; display: block; border: 1px solid rgba(255,255,255,0.1);" onclick="window.open('${m.attachment}', '_blank')">
                  </div>
                ` : ''}
              </div>
              <span style="font-size: 0.72rem; color: #64748b; margin-bottom: 4px; white-space: nowrap; flex-shrink: 0;">${timeStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (wasAtBottom || !isSilent) {
      setTimeout(() => {
        container.scrollTop = container.scrollHeight;
      }, 30);
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  }

  /**
   * Send a Message (Supports customer chatting with admin, or admin replying to customer)
   */
  async sendMessage(textOverride = null) {
    const input = document.getElementById('chat-message-input');
    const text = (typeof textOverride === 'string') ? textOverride.trim() : (input ? input.value.trim() : '');
    const attachment = this.selectedAttachmentData;

    if (!text && !attachment) return;

    let user = window.authManager ? window.authManager.currentUser : null;
    if (!user) {
      user = { id: 'usr_member', username: 'member', role: 'member' };
    }

    const isAdmin = (user.role === 'admin');
    const senderRole = isAdmin ? 'admin' : 'customer';
    const senderUsername = isAdmin ? 'Admin Little Cloud' : (user.username || 'member');

    const newMsg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      order_id: this.activeOrderId || 'general',
      user_id: user.id || 'usr_member',
      username: senderUsername,
      customer_username: this.activeCustomerUsername || (isAdmin ? 'ลูกค้า FiveM' : user.username),
      sender_role: senderRole,
      message: text,
      attachment: attachment || '',
      product_name: this.activeProductName || '',
      delivery_code: this.activeDeliveryCode || '',
      created_at: new Date().toISOString()
    };

    // 1. Reset input & attachment immediately
    if (input) input.value = '';
    this.clearAttachment();

    // 2. OPTIMISTIC UI: Instantly add to memory and render right away (0ms delay!)
    this.activeMessages.push(newMsg);
    const partitionUser = this.isAdminViewing ? (this.activeCustomerUsername || 'cust') : (user.username || 'member');
    const cacheKey = `lc_chat_${partitionUser.toLowerCase()}_${this.activeOrderId}`;
    localStorage.setItem(cacheKey, JSON.stringify(this.activeMessages));
    this.renderMessages();

    // 3. Asynchronously post to backend API
    const apiBase = this.getApiBaseUrl();
    try {
      fetch(`${apiBase}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMsg)
      }).catch(err => {
        console.warn('Chat backend async notice:', err);
      });
    } catch (e) { }

    // 4. Smart Admin Auto-Reply Simulation (ONLY trigger if a CUSTOMER is sending, NOT when admin is typing)
    if (senderRole === 'customer') {
      this.triggerSmartAdminAssistant(text, attachment);
    }
  }

  /**
   * Send Quick Message from Pills (Instant click without typing)
   */
  sendQuickMessage(quickText) {
    if (!quickText) return;
    this.sendMessage(quickText);
  }

  /**
   * Smart Admin Auto-Responder (Instant helpful guidance matching user inquiry)
   */
  triggerSmartAdminAssistant(customerText, customerAttachment) {
    const lower = (customerText || '').toLowerCase();
    let reply = '';

    if (lower.includes('นัดรับ') || lower.includes('รับของ') || lower.includes('fivem') || lower.includes('ในเกม') || lower.includes('เข้าเกม')) {
      reply = 'แอดมินรับเรื่องแล้วครับ! รบกวนแจ้ง "เลข ID" "ชื่อตัวละครในเกมส์" และ "พิกัดที่สะดวกนัดพบในเมือง" ไว้ได้เลยครับ ทีมงานแอดมินกำลังออนไลน์พร้อมส่งมอบของให้ทันทีครับ 🚗💨';
    } else if (lower.includes('โค้ด') || lower.includes('ใช้ยังไง') || lower.includes('วิธีใช้')) {
      reply = 'สำหรับสินค้ารายการนี้ ทางแอดมินจะดำเนินการส่งมอบให้คุณในเกม FiveM โดยตรงครับ สามารถแจ้ง "เลข ID" "ชื่อตัวละคร" และจุดนัดพบในแชทนี้ได้เลยครับ 🚗✨';
    } else if (lower.includes('discord') || lower.includes('ดิสคอร์ด')) {
      reply = 'สามารถเข้าร่วม Discord ของ Little Cloud Shop เพื่อติดต่อทีมงานแบบเสียง (Voice) หรือเปิดตั๋ว Ticket รับของได้ที่: https://discord.gg/littlecloud ครับ 🎧';
    } else if (lower.includes('ปัญหา') || lower.includes('ช่วย') || lower.includes('ไม่ได้') || lower.includes('error')) {
      reply = 'รับเรื่องแจ้งปัญหาครับ รบกวนแจ้งรายละเอียด หรือกดปุ่มแนบรูปภาพ 📎 ด้านล่าง เพื่อส่งภาพหน้าจอให้แอดมินตรวจสอบได้เลยครับ ทีมงานจะรีบแก้ไขให้ทันทีครับ ⚠️';
    } else if (customerAttachment && !customerText) {
      reply = 'แอดมินได้รับรูปภาพที่คุณส่งมาเรียบร้อยแล้วครับ! เจ้าหน้าที่กำลังตรวจสอบและจะดำเนินการให้ทันทีครับ 📸💖';
    } else {
      reply = 'แอดมิน Little Cloud ได้รับข้อความของคุณเรียบร้อยแล้วครับ! เจ้าหน้าที่กำลังตรวจสอบและจะติดต่อกลับในไม่กี่อึดใจ หากต้องการอะไรเพิ่มเติมพิมพ์ทิ้งไว้ได้เลยครับ 💖';
    }

    // Show "Admin is typing..." indicator after 1.0s
    setTimeout(() => {
      const container = document.getElementById('chat-messages-container');
      if (container && this.isChatOpen && !this.isAdminViewing) {
        let typingEl = document.getElementById('chat-typing-indicator');
        if (!typingEl) {
          typingEl = document.createElement('div');
          typingEl.id = 'chat-typing-indicator';
          typingEl.style.cssText = 'display: flex; gap: 8px; align-items: center; margin: 8px 0; font-size: 0.78rem; color: #fb7185; font-weight: 600;';
          typingEl.innerHTML = `
            <div style="width: 26px; height: 26px; border-radius: 50%; background: #23263b; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #fb7185;">
              <i class="fas fa-headset"></i>
            </div>
            <span><i class="fas fa-circle-notch fa-spin"></i> แอดมิน Little Cloud กำลังพิมพ์ข้อความ...</span>
          `;
          container.appendChild(typingEl);
          container.scrollTop = container.scrollHeight;
        }
      }
    }, 1000);

    // Deliver Admin Message at 2.4s
    setTimeout(async () => {
      const typingEl = document.getElementById('chat-typing-indicator');
      if (typingEl) typingEl.remove();

      if (this.isAdminViewing) return; // If real admin is currently in the chat, don't generate bot message

      const adminReplyObj = {
        id: `msg_admin_${Date.now()}`,
        order_id: this.activeOrderId || 'general',
        user_id: 'admin_sys',
        username: 'Admin Little Cloud',
        customer_username: this.activeCustomerUsername,
        sender_role: 'admin',
        message: reply,
        attachment: '',
        product_name: this.activeProductName || '',
        delivery_code: this.activeDeliveryCode || '',
        created_at: new Date().toISOString()
      };

      this.activeMessages.push(adminReplyObj);
      const partitionUser = this.activeCustomerUsername || 'member';
      const cacheKey = `lc_chat_${partitionUser.toLowerCase()}_${this.activeOrderId}`;
      localStorage.setItem(cacheKey, JSON.stringify(this.activeMessages));
      this.renderMessages();

      // Sync admin reply to backend API
      const apiBase = this.getApiBaseUrl();
      try {
        fetch(`${apiBase}/api/chat/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(adminReplyObj)
        }).catch(() => { });
      } catch (e) { }
    }, 2400);
  }

  /**
   * Handle image attachment with automatic canvas compression
   */
  handleAttachmentSelected(input) {
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Compress large photos to max 1280px width/height for fast transmission
          const maxDim = 1280;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          this.selectedAttachmentData = canvas.toDataURL('image/jpeg', 0.85);

          const previewWrap = document.getElementById('chat-attachment-preview-wrap');
          const previewImg = document.getElementById('chat-attachment-preview-img');
          if (previewWrap && previewImg) {
            previewImg.src = this.selectedAttachmentData;
            previewWrap.style.display = 'flex';
          }
        };
        img.src = e.target.result;
      };

      reader.readAsDataURL(file);
    }
  }

  clearAttachment() {
    this.selectedAttachmentData = null;
    const input = document.getElementById('chat-file-input');
    const previewWrap = document.getElementById('chat-attachment-preview-wrap');
    if (input) input.value = '';
    if (previewWrap) previewWrap.style.display = 'none';
  }

  updateUnreadBadge() {
    const badge = document.getElementById('chat-unread-count');
    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // ==============================================================
  // ADMIN PANEL LIVE CHAT TAB (Manage customer conversations)
  // ==============================================================
  async renderAdminChatPane() {
    const threadsContainer = document.getElementById('admin-chat-threads-list');
    if (!threadsContainer) return;

    threadsContainer.innerHTML = `<div style="text-align:center; padding: 30px; color: #a5a8bc;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลดรายการแชท...</div>`;

    try {
      const apiBase = this.getApiBaseUrl();
      const resp = await fetch(`${apiBase}/api/chat/threads`);
      let threads = [];
      if (resp.ok) {
        const data = await resp.json();
        threads = data.threads || [];
      }

      if (threads.length === 0) {
        threadsContainer.innerHTML = `<div style="text-align:center; padding: 40px 10px; color: #64748b;"><i class="fas fa-comments" style="font-size: 2rem; margin-bottom: 8px; display: block; opacity: 0.4;"></i>ยังไม่มีการสนทนาจากลูกค้า</div>`;
        return;
      }

      threadsContainer.innerHTML = threads.map(t => `
        <div class="admin-chat-thread-item ${this.adminActiveOrderId === t.order_id ? 'active' : ''}" 
             style="padding: 12px 14px; border-bottom: 1px solid #202232; cursor: pointer; transition: all 0.2s;"
             onclick="window.chatManager.adminSelectThread('${t.order_id}', '${t.username}', '${t.product_name}', '${t.delivery_code}')">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <b style="color: #fff; font-size: 0.88rem;">${t.username || 'ลูกค้า'}</b>
            <span style="font-size: 0.7rem; color: #64748b;">${new Date(t.last_time || Date.now()).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div style="font-size: 0.75rem; color: #f472b6; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            📦 ${t.product_name || 'ออเดอร์'}
          </div>
          <div style="font-size: 0.78rem; color: #a5a8bc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">
            ${t.last_message || ''}
          </div>
        </div>
      `).join('');

      // Auto-select first thread if none active
      if (!this.adminActiveOrderId && threads.length > 0) {
        const first = threads[0];
        this.adminSelectThread(first.order_id, first.username, first.product_name, first.delivery_code);
      }
    } catch (e) {
      console.warn('Admin chat threads error:', e);
    }
  }

  async adminSelectThread(orderId, username, productName, deliveryCode) {
    this.adminActiveOrderId = orderId;
    const headerTitle = document.getElementById('admin-chat-header-title');
    const headerOrder = document.getElementById('admin-chat-header-order');

    if (headerTitle) headerTitle.textContent = `สนทนากับคุณ ${username}`;
    if (headerOrder) headerOrder.textContent = `ออเดอร์: ${productName}`;

    await this.adminLoadThreadMessages();

    // Start Polling for Admin View
    if (this.adminPollingTimer) clearInterval(this.adminPollingTimer);
    this.adminPollingTimer = setInterval(() => this.adminLoadThreadMessages(true), 2500);
  }

  async adminLoadThreadMessages(isSilent = false) {
    if (!this.adminActiveOrderId) return;
    const container = document.getElementById('admin-chat-messages-box');
    if (!container) return;

    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 60;

    try {
      const apiBase = this.getApiBaseUrl();
      const resp = await fetch(`${apiBase}/api/chat/messages?order_id=${encodeURIComponent(this.adminActiveOrderId)}`);
      if (resp.ok) {
        const data = await resp.json();
        const messages = data.messages || [];

        container.innerHTML = messages.map(m => {
          const isAdmin = m.sender_role === 'admin';
          const isSystem = m.sender_role === 'system';
          const time = new Date(m.created_at || Date.now()).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

          if (isSystem) {
            return `<div style="text-align:center; font-size: 0.75rem; color: #f472b6; margin: 8px 0; background: rgba(225,29,72,0.1); padding: 6px; border-radius: 6px;">${m.message}</div>`;
          }

          if (isAdmin) {
            return `
              <div style="display:flex; justify-content: flex-end; margin-bottom: 10px;">
                <div style="max-width: 75%;">
                  <div style="background: #e11d48; color: #fff; padding: 8px 12px; border-radius: 12px 12px 2px 12px; font-size: 0.85rem;">
                    ${m.message}
                  </div>
                  <div style="font-size: 0.68rem; color: #64748b; text-align: right; margin-top: 2px;">คุณ (แอดมิน) • ${time}</div>
                </div>
              </div>
            `;
          }

          return `
            <div style="display:flex; gap: 8px; margin-bottom: 10px;">
              <div style="max-width: 75%;">
                <div style="background: #1e202e; border: 1px solid #2d3045; color: #fff; padding: 8px 12px; border-radius: 2px 12px 12px 12px; font-size: 0.85rem;">
                  ${m.message}
                  ${m.attachment ? `<div style="margin-top: 6px;"><img src="${m.attachment}" style="max-width: 100%; border-radius: 6px;"></div>` : ''}
                </div>
                <div style="font-size: 0.68rem; color: #64748b; margin-top: 2px;">${m.username} • ${time}</div>
              </div>
            </div>
          `;
        }).join('');

        if (wasAtBottom || !isSilent) {
          container.scrollTop = container.scrollHeight;
        }
      }
    } catch (e) { }
  }

  async adminSendMessage() {
    const input = document.getElementById('admin-chat-input-text');
    const text = input ? input.value.trim() : '';
    if (!text || !this.adminActiveOrderId) return;

    if (input) input.value = '';

    try {
      const apiBase = this.getApiBaseUrl();
      await fetch(`${apiBase}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: this.adminActiveOrderId,
          username: 'Admin Little Cloud',
          sender_role: 'admin',
          message: text
        })
      });

      this.adminLoadThreadMessages();
    } catch (e) {
      console.warn('Admin send error:', e);
    }
  }

  adminSendQuick(text) {
    const input = document.getElementById('admin-chat-input-text');
    if (input) {
      input.value = text;
      this.adminSendMessage();
    }
  }
}

window.chatManager = new ChatManager();
