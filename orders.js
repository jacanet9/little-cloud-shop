// ==============================================================================
// LITTLE CLOUD / JELLY TOWN - REAL PROFILE & HISTORY ENGINE (Image 5 Style)
// ==============================================================================

class OrdersManager {
  constructor() {}

  async loadProfileOrders() {
    const container = document.getElementById('profile-orders-list-content');
    if (!container) return;

    const user = window.authManager.currentUser;
    if (!user) {
      container.innerHTML = `<p style="text-align:center; color: var(--text-dim); padding: 40px 0;">กรุณาเข้าสู่ระบบเพื่อดูประวัติการสั่งซื้อ</p>`;
      return;
    }

    container.innerHTML = `<div style="text-align:center; padding: 40px 0; color: var(--text-dim);"><i class="fas fa-spinner fa-spin"></i> กำลังโหลดประวัติจาก Supabase...</div>`;

    const allOrders = await window.supabaseManager.fetchTable('orders');
    let userOrders = (allOrders || []).filter(o => 
      (o.user_id && user.id && o.user_id === user.id) ||
      (o.username && user.username && o.username.toLowerCase() === user.username.toLowerCase())
    );

    const isAdminOrdersOverview = (userOrders.length === 0 && user.role === 'admin');
    if (isAdminOrdersOverview) {
      userOrders = allOrders || [];
    }

    userOrders.sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeB - timeA;
    });

    if (userOrders.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-dim);">
          <i class="fas fa-box-open" style="font-size: 2.5rem; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
          <p>ยังไม่มีประวัติการสั่งซื้อ</p>
        </div>
      `;
      return;
    }

    this._cachedOrders = userOrders;
    const isCurrentUserAdmin = user && user.role === 'admin';

    container.innerHTML = userOrders.map(o => {
      const orderStatus = (o.status || 'completed').toLowerCase();
      let statusHtml = '';
      if (orderStatus === 'completed' || orderStatus === 'paid' || orderStatus === 'approved') {
        statusHtml = `<span style="font-size: 0.76rem; color: #10b981; background: rgba(16,185,129,0.12); padding: 3px 8px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;"><i class="fas fa-check-circle"></i> ชำระเงินแล้ว</span>`;
      } else if (orderStatus === 'pending' || orderStatus === 'waiting_payment') {
        statusHtml = `<span style="font-size: 0.76rem; color: #f59e0b; background: rgba(245,158,11,0.12); padding: 3px 8px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;"><i class="fas fa-clock"></i> รอชำระเงิน</span>`;
      } else if (orderStatus === 'cancelled' || orderStatus === 'rejected') {
        statusHtml = `<span style="font-size: 0.76rem; color: #ef4444; background: rgba(239,68,68,0.12); padding: 3px 8px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;"><i class="fas fa-circle-xmark"></i> ยกเลิก/ไม่อนุมัติ</span>`;
      } else {
        statusHtml = `<span style="font-size: 0.76rem; color: #9496a8; background: rgba(148,150,168,0.12); padding: 3px 8px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;"><i class="fas fa-circle-question"></i> ยังไม่ได้ชำระ</span>`;
      }

      const chatBtnText = isCurrentUserAdmin ? `แชทกับลูกค้า (${o.username || 'ลูกค้า'})` : 'แชทกับแอดมินสำหรับออเดอร์นี้';

      return `
        <div style="background: #1a1b28; border: 1px solid #282a3c; border-radius: 12px; padding: 16px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <b style="color: #fff; font-size: 1rem;">
              ${o.product_name}
              ${o.quantity && o.quantity > 1 ? `<span style="background: rgba(228, 37, 117, 0.2); color: #f472b6; border: 1px solid rgba(228, 37, 117, 0.4); padding: 1px 8px; border-radius: 6px; font-size: 0.8rem; margin-left: 6px;">x${o.quantity} ชิ้น</span>` : ''}
              ${isCurrentUserAdmin ? `<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; margin-left: 6px;"><i class="fas fa-user"></i> ${o.username}</span>` : ''}
            </b>
            <span style="color: #f472b6; font-weight: 800; font-family: 'Outfit', sans-serif; font-size: 1.1rem;">${(Number(o.total_price)||0).toLocaleString('th-TH')} บาท</span>
          </div>
          <div style="font-size: 0.8rem; color: #a5a8bc; display: flex; justify-content: space-between;">
            <span>รหัสออเดอร์: <code style="color: #fff;">${o.id}</code></span>
            <span>${new Date(o.created_at || Date.now()).toLocaleString('th-TH')}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);">
            ${statusHtml}
            <button type="button" class="btn-outline-dark" style="padding: 5px 12px; font-size: 0.76rem; display: flex; align-items: center; gap: 6px;" onclick="window.ordersManager && window.ordersManager.openChatForOrder('${o.id}');">
              <i class="fas fa-comments" style="color: #f472b6;"></i> ${chatBtnText}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  openChatForOrder(orderId) {
    const all = this._cachedOrders || [];
    const ord = all.find(item => String(item.id) === String(orderId));
    const user = window.authManager ? window.authManager.currentUser : null;
    if (ord && window.chatManager) {
      window.chatManager.openChatForOrder(
        ord.id,
        ord.product_name,
        ord.delivery_code || '',
        ord.username || (user ? user.username : 'member'),
        ord.status || 'completed'
      );
    } else if (window.chatManager) {
      window.chatManager.openChatForOrder(orderId, 'ออเดอร์สินค้า', '', (user ? user.username : 'member'), 'completed');
    }
  }

  async loadProfileTopups() {
    const container = document.getElementById('profile-topups-list-content');
    if (!container) return;

    const user = window.authManager.currentUser;
    if (!user) {
      container.innerHTML = `<p style="text-align:center; color: var(--text-dim); padding: 40px 0;">กรุณาเข้าสู่ระบบเพื่อดูประวัติการเติมเงิน</p>`;
      return;
    }

    container.innerHTML = `<div style="text-align:center; padding: 40px 0; color: var(--text-dim);"><i class="fas fa-spinner fa-spin"></i> กำลังโหลดประวัติจาก Supabase...</div>`;

    const allTopups = await window.supabaseManager.fetchTable('topups');
    let userTopups = (allTopups || []).filter(t => 
      (t.user_id && user.id && t.user_id === user.id) ||
      (t.username && user.username && t.username.toLowerCase() === user.username.toLowerCase())
    );

    // If logged in as admin and has no personal topups, show shop overview
    const isAdminOverview = (userTopups.length === 0 && user.role === 'admin');
    if (isAdminOverview) {
      userTopups = allTopups || [];
    }

    userTopups.sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      return timeB - timeA;
    });

    if (userTopups.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-dim);">
          <i class="fas fa-receipt" style="font-size: 2.5rem; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
          <p>ยังไม่มีประวัติการเติมเงิน</p>
        </div>
      `;
      return;
    }

    container.innerHTML = userTopups.map(t => {
      const status = (t.status || 'approved').toLowerCase();
      const amountVal = Number(t.amount) || 0;
      const formattedAmount = amountVal.toLocaleString('th-TH', { minimumFractionDigits: 2 });
      const dateStr = new Date(t.created_at || Date.now()).toLocaleString('th-TH');
      
      let amountHtml = '';
      let statusHtml = '';
      let borderStyle = '1px solid #282a3c';
      let cardBg = '#1a1b28';

      if (status === 'rejected') {
        // REJECTED - Clearly state rejected, do NOT show +พอยท์ or green text!
        cardBg = 'rgba(239, 68, 68, 0.05)';
        borderStyle = '1px solid rgba(239, 68, 68, 0.3)';
        amountHtml = `
          <div style="color: #9496a8; font-weight: 700; font-size: 1.05rem; font-family: 'Outfit', sans-serif; text-decoration: line-through;">
            ฿ ${formattedAmount}
          </div>
          <div style="font-size: 0.68rem; color: #ef4444; font-weight: 600;">+0 พอยท์ (ไม่อนุมัติ)</div>
        `;
        
        let reasonText = '';
        if (t.verified_by && t.verified_by.includes('Admin Rejected:')) {
          reasonText = t.verified_by.replace(/^Admin Rejected:\s*/, '').trim();
        } else if (t.verified_by && t.verified_by.toLowerCase().includes('reject')) {
          reasonText = t.verified_by;
        }

        statusHtml = `
          <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.35); padding: 2px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; margin-top: 4px;">
            <i class="fas fa-circle-xmark" style="color: #ef4444;"></i> ปฏิเสธ (Rejected)
          </div>
          ${reasonText ? `<div style="font-size: 0.68rem; color: #f87171; margin-top: 3px; max-width: 220px; text-align: right; line-height: 1.3;">${reasonText}</div>` : ''}
        `;

      } else if (status === 'pending') {
        // PENDING - Waiting for admin review
        cardBg = 'rgba(245, 158, 11, 0.05)';
        borderStyle = '1px solid rgba(245, 158, 11, 0.3)';
        amountHtml = `
          <div style="color: #fbbf24; font-weight: 800; font-size: 1.1rem; font-family: 'Outfit', sans-serif;">
            ฿ ${formattedAmount}
          </div>
          <div style="font-size: 0.68rem; color: #fde68a;">รอแอดมินยืนยันยอด</div>
        `;
        statusHtml = `
          <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); padding: 2px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; margin-top: 4px;">
            <i class="fas fa-clock"></i> รอตรวจสอบ (Pending)
          </div>
        `;

      } else {
        // APPROVED / COMPLETED
        cardBg = '#1a1b28';
        borderStyle = '1px solid #282a3c';
        amountHtml = `
          <div style="color: #34d399; font-weight: 800; font-size: 1.15rem; font-family: 'Outfit', sans-serif;">
            +${amountVal.toLocaleString('th-TH')} บาท
          </div>
        `;
        statusHtml = `
          <div style="display: inline-flex; align-items: center; gap: 4px; color: #34d399; font-size: 0.75rem; font-weight: 700; margin-top: 2px;">
            <i class="fas fa-circle-check"></i> สำเร็จ
          </div>
        `;
      }

      return `
        <div style="background: ${cardBg}; border: ${borderStyle}; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <b style="color: #fff; font-size: 0.95rem;">${t.payment_method || 'PromptPay QR'}</b>
              ${isAdminOverview && t.username ? `<span style="font-size: 0.7rem; color: #cbd5e1; background: #232537; padding: 1px 6px; border-radius: 4px;">👤 ${t.username}</span>` : ''}
              ${t.transaction_ref ? `<span style="font-size: 0.7rem; color: #64748b; font-family: monospace;">#${t.transaction_ref.substring(0, 12)}</span>` : ''}
            </div>
            <div style="font-size: 0.78rem; color: #a5a8bc; margin-top: 4px;">${dateStr}</div>
          </div>
          <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
            ${amountHtml}
            ${statusHtml}
          </div>
        </div>
      `;
    }).join('');
  }
}

window.ordersManager = new OrdersManager();

window.showHistoryTab = function(tab) {
  const btnOrders = document.getElementById('btn-hist-orders');
  const btnTopups = document.getElementById('btn-hist-topups');
  const viewOrders = document.getElementById('history-orders-view');
  const viewTopups = document.getElementById('history-topups-view');

  if (tab === 'orders') {
    if (btnOrders) { btnOrders.className = 'btn-pink'; }
    if (btnTopups) { btnTopups.className = 'btn-outline-dark'; }
    if (viewOrders) viewOrders.style.display = 'block';
    if (viewTopups) viewTopups.style.display = 'none';
    window.ordersManager.loadProfileOrders();
  } else {
    if (btnOrders) { btnOrders.className = 'btn-outline-dark'; }
    if (btnTopups) { btnTopups.className = 'btn-pink'; }
    if (viewOrders) viewOrders.style.display = 'none';
    if (viewTopups) viewTopups.style.display = 'block';
    window.ordersManager.loadProfileTopups();
  }
};
