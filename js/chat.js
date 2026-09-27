// ==============================================================================
// LITTLE CLOUD SHOP - REAL CUSTOMER-TO-ADMIN LIVE CHAT ENGINE
// Real-time Order Chat, Instant Support, Image Attachments & Admin Panel Live Chat
// ==============================================================================

class ChatManager {
  constructor() {
    this.activeOrderId = null;
    this.activeProductName = '';
    this.activeDeliveryCode = '';
    this.pollingTimer = null;
    this.isChatOpen = false;
    this.unreadCount = 0;
    this.selectedAttachmentData = null;
    this.adminActiveOrderId = null;
    this.adminPollingTimer = null;

    this.bindGlobalEvents();
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
   * Open Chat for a specific order right after purchase (or from order history)
   */
  async openChatForOrder(orderId, productName = '', deliveryCode = '') {
    const user = window.authManager.currentUser;
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

    this.activeOrderId = orderId || 'general';
    this.activeProductName = productName || 'สินค้า';
    this.activeDeliveryCode = deliveryCode || '';
    this.unreadCount = 0;
    this.updateUnreadBadge();

    // Show Chat Window
    const chatModal = document.getElementById('modal-order-chat');
    if (chatModal) {
      chatModal.style.display = 'flex';
      this.isChatOpen = true;
    }

    // Update Header Context
    const orderTitle = document.getElementById('chat-order-product-name');
    const orderRef = document.getElementById('chat-order-ref-badge');
    const orderKeyBox = document.getElementById('chat-order-delivery-code');
    const orderContextBanner = document.getElementById('chat-order-context-banner');

    if (orderTitle) orderTitle.textContent = this.activeProductName;
    if (orderRef) orderRef.textContent = `#${(this.activeOrderId || '').substring(0, 18)}`;
    if (orderKeyBox) {
      if (this.activeDeliveryCode) {
        orderKeyBox.textContent = this.activeDeliveryCode;
        if (orderContextBanner) orderContextBanner.style.display = 'block';
      } else {
        if (orderContextBanner) orderContextBanner.style.display = 'none';
      }
    }

    // Clear and load messages
    await this.loadMessages();

    // Start Real-Time Live Polling (every 2.5 seconds)
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(() => this.loadMessages(true), 2500);

    // Focus input
    setTimeout(() => {
      const input = document.getElementById('chat-message-input');
      if (input) input.focus();
    }, 150);
  }

  toggleChat() {
    if (this.isChatOpen) {
      this.closeChat();
    } else {
      this.openChatForOrder(this.activeOrderId || 'general', this.activeProductName || 'ฝ่ายบริการลูกค้า', this.activeDeliveryCode);
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
   * Fetch and render messages for active order
   */
  async loadMessages(isSilent = false) {
    const user = window.authManager.currentUser;
    if (!user || !this.activeOrderId) return;

    try {
      let messages = [];

      // 1. Try Backend API
      try {
        const resp = await fetch(`/api/chat/messages?order_id=${encodeURIComponent(this.activeOrderId)}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.success && Array.isArray(data.messages)) {
            messages = data.messages;
          }
        }
      } catch (apiErr) {
        // Fallback to localStorage
        const stored = localStorage.getItem(`little_cloud_chat_${this.activeOrderId}`);
        if (stored) {
          try { messages = JSON.parse(stored); } catch (e) {}
        }
      }

      // If brand new order with no messages yet, send automatic System Welcome message
      if (messages.length === 0 && this.activeOrderId !== 'general') {
        const welcomeMsg = {
          id: `sys_welcome_${Date.now()}`,
          order_id: this.activeOrderId,
          username: 'System Little Cloud',
          sender_role: 'system',
          message: `ยินดีด้วยครับ! คุณได้สั่งซื้อ "${this.activeProductName}" เรียบร้อยแล้ว ทีมงานแอดมิน Little Cloud พร้อมให้บริการส่งมอบสินค้าในเกม FiveM หรือช่วยเหลือคุณตลอด 24 ชม. สามารถพิมพ์ข้อความแจ้งแอดมินได้เลยครับ 💖`,
          product_name: this.activeProductName,
          delivery_code: this.activeDeliveryCode,
          created_at: new Date().toISOString()
        };

        try {
          await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(welcomeMsg)
          });
          messages.push(welcomeMsg);
        } catch (e) {
          messages.push(welcomeMsg);
        }
      }

      this.renderMessages(messages, isSilent);

    } catch (err) {
      console.warn('Load messages warning:', err);
    }
  }

  /**
   * Render message bubbles into chat container
   */
  renderMessages(messages, isSilent = false) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    const user = window.authManager.currentUser;
    const currentUsername = user ? user.username.toLowerCase() : '';
    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 60;

    if (messages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #a5a8bc;">
          <div style="width: 50px; height: 50px; border-radius: 50%; background: #1c1e2d; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; color: #f472b6; font-size: 1.3rem;">
            <i class="fas fa-comments"></i>
          </div>
          <b style="color: #fff; font-size: 0.95rem;">เริ่มการสนทนากับแอดมิน</b>
          <p style="font-size: 0.8rem; color: #64748b; margin-top: 4px;">พิมพ์ข้อความหรือเลือกปุ่มด่วนด้านล่างเพื่อคุยกับทีมงาน</p>
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(m => {
      const isSystem = m.sender_role === 'system';
      const isAdmin = m.sender_role === 'admin';
      const isMe = !isAdmin && !isSystem && (m.username && m.username.toLowerCase() === currentUsername);

      const timeStr = new Date(m.created_at || Date.now()).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      // 1. System Welcome / Order Card
      if (isSystem) {
        return `
          <div class="chat-msg-system" style="margin: 12px 0; text-align: center;">
            <div style="background: rgba(225, 29, 72, 0.1); border: 1px solid rgba(225, 29, 72, 0.25); border-radius: 12px; padding: 12px 16px; display: inline-block; max-width: 90%; text-align: left;">
              <div style="display: flex; align-items: center; gap: 6px; color: #f472b6; font-weight: 700; font-size: 0.82rem; margin-bottom: 4px;">
                <i class="fas fa-crown"></i> <span>ระบบบริการลูกค้าอัตโนมัติ (Little Cloud Bot)</span>
              </div>
              <div style="color: #e2e8f0; font-size: 0.82rem; line-height: 1.5;">${m.message}</div>
              ${m.delivery_code ? `
                <div style="margin-top: 8px; background: #0c0d14; border: 1px dashed #e11d48; border-radius: 8px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-family: monospace; color: #34d399; font-weight: 700; font-size: 0.8rem; word-break: break-all;">${m.delivery_code}</span>
                  <button type="button" class="btn-outline-dark" style="padding: 3px 8px; font-size: 0.72rem; margin-left: 8px;" onclick="navigator.clipboard.writeText('${m.delivery_code}'); Swal.fire({icon:'success', title:'คัดลอกรหัสแล้ว', timer:900, showConfirmButton:false});">
                    <i class="far fa-copy"></i>
                  </button>
                </div>
              ` : ''}
              <div style="font-size: 0.7rem; color: #64748b; margin-top: 4px; text-align: right;">${timeStr}</div>
            </div>
          </div>
        `;
      }

      // 2. Customer Message (My bubble, Right-aligned)
      if (isMe) {
        return `
          <div class="chat-msg-row chat-msg-me" style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
            <div style="max-width: 78%;">
              <div style="background: linear-gradient(135deg, #e11d48 0%, #be123c 100%); color: #ffffff; padding: 10px 14px; border-radius: 16px 16px 4px 16px; font-size: 0.86rem; line-height: 1.5; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.25);">
                ${m.message ? `<div>${this.escapeHtml(m.message)}</div>` : ''}
                ${m.attachment ? `<div style="margin-top: 6px;"><img src="${m.attachment}" style="max-width: 100%; max-height: 180px; border-radius: 8px; cursor: pointer;" onclick="window.open('${m.attachment}', '_blank')"></div>` : ''}
              </div>
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; font-size: 0.68rem; color: #64748b; margin-top: 3px;">
                <span>${timeStr}</span>
                <span style="color: #38bdf8;"><i class="fas fa-check-double"></i></span>
              </div>
            </div>
          </div>
        `;
      }

      // 3. Admin Message (Left-aligned)
      return `
        <div class="chat-msg-row chat-msg-admin" style="display: flex; gap: 10px; margin-bottom: 12px;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%); display: flex; align-items: center; justify-content: center; color: #000; font-size: 0.85rem; font-weight: 800; flex-shrink: 0; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);">
            <i class="fas fa-shield-halved"></i>
          </div>
          <div style="max-width: 78%;">
            <div style="font-size: 0.72rem; color: #fbbf24; font-weight: 700; margin-bottom: 2px;">
              <span>แอดมิน Little Cloud</span> <span style="background: rgba(245, 158, 11, 0.2); padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; margin-left: 4px;">OFFICIAL</span>
            </div>
            <div style="background: #1e202e; border: 1px solid #2d3045; color: #f1f5f9; padding: 10px 14px; border-radius: 4px 16px 16px 16px; font-size: 0.86rem; line-height: 1.5;">
              ${m.message ? `<div>${this.escapeHtml(m.message)}</div>` : ''}
              ${m.attachment ? `<div style="margin-top: 6px;"><img src="${m.attachment}" style="max-width: 100%; max-height: 180px; border-radius: 8px; cursor: pointer;" onclick="window.open('${m.attachment}', '_blank')"></div>` : ''}
            </div>
            <div style="font-size: 0.68rem; color: #64748b; margin-top: 3px;">
              <span>${timeStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (wasAtBottom || !isSilent) {
      container.scrollTop = container.scrollHeight;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  }

  /**
   * Customer Sends a Message
   */
  async sendMessage() {
    const input = document.getElementById('chat-message-input');
    const text = input ? input.value.trim() : '';
    const attachment = this.selectedAttachmentData;

    if (!text && !attachment) return;

    const user = window.authManager.currentUser;
    if (!user) {
      window.authManager.openAuthModal('login');
      return;
    }

    const senderRole = user.role === 'admin' ? 'admin' : 'customer';

    const msgPayload = {
      order_id: this.activeOrderId || 'general',
      user_id: user.id,
      username: user.username,
      sender_role: senderRole,
      message: text,
      attachment: attachment || '',
      product_name: this.activeProductName || '',
      delivery_code: this.activeDeliveryCode || ''
    };

    // Reset input immediately for instant responsiveness
    if (input) input.value = '';
    this.clearAttachment();

    try {
      const resp = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msgPayload)
      });

      if (resp.ok) {
        await this.loadMessages();
      }
    } catch (err) {
      // Local storage fallback
      const stored = localStorage.getItem(`little_cloud_chat_${this.activeOrderId}`) || '[]';
      let list = [];
      try { list = JSON.parse(stored); } catch (e) {}
      msgPayload.id = `msg_loc_${Date.now()}`;
      msgPayload.created_at = new Date().toISOString();
      list.push(msgPayload);
      localStorage.setItem(`little_cloud_chat_${this.activeOrderId}`, JSON.stringify(list));
      this.loadMessages();
    }

    // Smart Admin Auto-Reply Simulation (If customer is chatting and not admin)
    if (senderRole === 'customer') {
      this.triggerSmartAdminAssistant(text);
    }
  }

  sendQuickMessage(quickText) {
    const input = document.getElementById('chat-message-input');
    if (input) {
      input.value = quickText;
      this.sendMessage();
    }
  }

  /**
   * Smart Admin Auto-Responder (Instant helpful guidance if admin is away)
   */
  triggerSmartAdminAssistant(customerText) {
    const lower = (customerText || '').toLowerCase();
    let reply = '';

    if (lower.includes('นัดรับ') || lower.includes('รับของ') || lower.includes('fivem') || lower.includes('ในเกม') || lower.includes('เข้าเกม')) {
      reply = 'แอดมินรับเรื่องแล้วครับ! รบกวนแจ้ง "ชื่อตัวละครในเกม" และ "เบอร์ติดต่อในเกม FiveM" ไว้ได้เลยครับ ทีมงานกำลังเข้าเกมเพื่อส่งของให้คุณที่การาจหลักครับ 🚗💨';
    } else if (lower.includes('โค้ด') || lower.includes('ใช้ยังไง') || lower.includes('รหัส') || lower.includes('key')) {
      reply = `รหัสไอเทมของคุณคือ: "${this.activeDeliveryCode || 'ตามที่ระบุด้านบน'}" สามารถนำไปพิมพ์คำสั่ง /redeem ในเกม หรือแจ้งแอดมินให้ช่วยกดเติมเข้าตัวละครได้ทันทีครับ ✨`;
    } else if (lower.includes('discord') || lower.includes('ดิสคอร์ด')) {
      reply = 'สามารถเข้าร่วม Discord ของ Little Cloud Shop เพื่อติดต่อทีมงานแบบเสียง (Voice) หรือเปิดตั๋วรับของได้ที่: discord.gg/littlecloud ครับ 🎧';
    } else {
      reply = 'แอดมิน Little Cloud ได้รับข้อความของคุณเรียบร้อยแล้วครับ! เจ้าหน้าที่กำลังตรวจสอบและจะติดต่อกลับในไม่กี่อึดใจ หากต้องการอะไรเพิ่มเติมพิมพ์ทิ้งไว้ได้เลยครับ 💖';
    }

    // Show "Admin is typing..." indicator after 1.2s, and post reply at 2.6s
    setTimeout(() => {
      const container = document.getElementById('chat-messages-container');
      if (container && this.isChatOpen) {
        const typingEl = document.createElement('div');
        typingEl.id = 'chat-typing-indicator';
        typingEl.style.cssText = 'display: flex; gap: 8px; align-items: center; margin: 8px 0; font-size: 0.75rem; color: #fbbf24; font-weight: 600;';
        typingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> แอดมิน Little Cloud กำลังพิมพ์ข้อความ...';
        container.appendChild(typingEl);
        container.scrollTop = container.scrollHeight;
      }
    }, 1200);

    setTimeout(async () => {
      const typingEl = document.getElementById('chat-typing-indicator');
      if (typingEl) typingEl.remove();

      const adminReplyObj = {
        order_id: this.activeOrderId || 'general',
        username: 'Admin Little Cloud',
        sender_role: 'admin',
        message: reply,
        product_name: this.activeProductName || '',
        delivery_code: this.activeDeliveryCode || ''
      };

      try {
        await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(adminReplyObj)
        });
        await this.loadMessages();
      } catch (e) {
        // Local fallback
        const stored = localStorage.getItem(`little_cloud_chat_${this.activeOrderId}`) || '[]';
        let list = [];
        try { list = JSON.parse(stored); } catch (err) {}
        adminReplyObj.id = `msg_admin_${Date.now()}`;
        adminReplyObj.created_at = new Date().toISOString();
        list.push(adminReplyObj);
        localStorage.setItem(`little_cloud_chat_${this.activeOrderId}`, JSON.stringify(list));
        this.loadMessages();
      }
    }, 2800);
  }

  handleAttachmentSelected(input) {
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        this.selectedAttachmentData = e.target.result;
        const previewWrap = document.getElementById('chat-attachment-preview-wrap');
        const previewImg = document.getElementById('chat-attachment-preview-img');
        if (previewWrap && previewImg) {
          previewImg.src = e.target.result;
          previewWrap.style.display = 'flex';
        }
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
      const resp = await fetch('/api/chat/threads');
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
    if (headerOrder) headerOrder.textContent = `ออเดอร์: ${productName} (Key: ${deliveryCode || '-'})`;

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
      const resp = await fetch(`/api/chat/messages?order_id=${encodeURIComponent(this.adminActiveOrderId)}`);
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
    } catch (e) {}
  }

  async adminSendMessage() {
    const input = document.getElementById('admin-chat-input-text');
    const text = input ? input.value.trim() : '';
    if (!text || !this.adminActiveOrderId) return;

    if (input) input.value = '';

    try {
      await fetch('/api/chat/send', {
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
