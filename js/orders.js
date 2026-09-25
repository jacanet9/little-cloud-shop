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
    const userOrders = allOrders.filter(o => 
      (o.username && o.username.toLowerCase() === user.username.toLowerCase()) ||
      (o.user_id && o.user_id === user.id) ||
      (user.role === 'admin')
    );

    if (userOrders.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-dim);">
          <i class="fas fa-box-open" style="font-size: 2.5rem; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
          <p>ยังไม่มีประวัติการสั่งซื้อ</p>
        </div>
      `;
      return;
    }

    container.innerHTML = userOrders.map(o => `
      <div style="background: #1a1b28; border: 1px solid #282a3c; border-radius: 12px; padding: 16px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <b style="color: #fff; font-size: 1rem;">
            ${o.product_name}
            ${o.quantity && o.quantity > 1 ? `<span style="background: rgba(228, 37, 117, 0.2); color: #f472b6; border: 1px solid rgba(228, 37, 117, 0.4); padding: 1px 8px; border-radius: 6px; font-size: 0.8rem; margin-left: 6px;">x${o.quantity} ชิ้น</span>` : ''}
          </b>
          <span style="color: #f472b6; font-weight: 800; font-family: 'Outfit', sans-serif; font-size: 1.1rem;">${(Number(o.total_price)||0).toLocaleString('th-TH')} บาท</span>
        </div>
        <div style="font-size: 0.8rem; color: #a5a8bc; display: flex; justify-content: space-between;">
          <span>รหัสออเดอร์: <code style="color: #fff;">${o.id}</code></span>
          <span>${new Date(o.created_at || Date.now()).toLocaleString('th-TH')}</span>
        </div>
        <div style="background: #11121c; padding: 8px 12px; border-radius: 6px; border: 1px dashed rgba(228, 37, 117, 0.4); margin-top: 4px;">
          <span style="font-size: 0.75rem; color: #a5a8bc;">ข้อมูลจัดส่ง / รหัสไอเทม:</span>
          <div style="color: #34d399; font-family: monospace; font-size: 0.9rem; font-weight: 700; word-break: break-all; margin-top: 2px;">
            ${o.delivery_code || 'จัดส่งเรียบร้อยแล้ว'}
          </div>
        </div>
      </div>
    `).join('');
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
    const userTopups = allTopups.filter(t => 
      (t.username && t.username.toLowerCase() === user.username.toLowerCase()) ||
      (t.user_id && t.user_id === user.id) ||
      (user.role === 'admin')
    );

    if (userTopups.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-dim);">
          <i class="fas fa-receipt" style="font-size: 2.5rem; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
          <p>ยังไม่มีประวัติการเติมเงิน</p>
        </div>
      `;
      return;
    }

    container.innerHTML = userTopups.map(t => `
      <div style="background: #1a1b28; border: 1px solid #282a3c; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <b style="color: #fff; font-size: 0.95rem;">${t.payment_method || 'PromptPay QR'}</b>
          <div style="font-size: 0.78rem; color: #a5a8bc; margin-top: 2px;">${new Date(t.created_at || Date.now()).toLocaleString('th-TH')}</div>
        </div>
        <div style="text-align: right;">
          <span style="color: #34d399; font-weight: 800; font-size: 1.1rem; font-family: 'Outfit', sans-serif;">+${(Number(t.amount)||0).toLocaleString('th-TH')} บาท</span>
          <div style="font-size: 0.72rem; color: #34d399;">สำเร็จ</div>
        </div>
      </div>
    `).join('');
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
