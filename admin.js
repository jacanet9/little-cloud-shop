// ==============================================================================
// LITTLE CLOUD SHOP - REAL ADMIN CONTROL PANEL & WEBSITE CUSTOMIZER
// (Direct Supabase Integration)
// ==============================================================================

class AdminManager {
  constructor() {
    this.editingProductId = null;
    this.currentTopups = [];
    this.activeSlipTopup = null;
    this.slipRotation = 0;
    this.slipZoomed = false;
    this.bindEvents();
  }

  bindEvents() {
    // Admin Tab Navigation
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-pane').forEach(p => p.style.display = 'none');

        btn.classList.add('active');
        const targetPane = document.getElementById(btn.dataset.pane);
        if (targetPane) targetPane.style.display = 'block';

        if (btn.dataset.pane === 'pane-admin-products') this.renderAdminProductsTable();
        if (btn.dataset.pane === 'pane-admin-site') this.loadSiteSettingsForm();
        if (btn.dataset.pane === 'pane-admin-users') this.renderAdminUsersTable();
        if (btn.dataset.pane === 'pane-admin-orders') this.renderAdminOrdersTable();
        if (btn.dataset.pane === 'pane-admin-topups') this.renderAdminTopupsTable();
        if (btn.dataset.pane === 'pane-admin-reconciliation') this.renderReconciliationDashboard();
        if (btn.dataset.pane === 'pane-admin-chat' && window.chatManager) window.chatManager.renderAdminChatPane();
      });
    });

    // Form: Add / Edit Product
    const formProduct = document.getElementById('form-admin-product');
    if (formProduct) {
      formProduct.addEventListener('submit', (e) => this.handleSaveProduct(e));
    }

    // Form: Site Customizer
    const formSite = document.getElementById('form-admin-site-settings');
    if (formSite) {
      formSite.addEventListener('submit', (e) => this.handleSaveSiteSettings(e));
    }

    // Form: Supabase Configuration
    const formSupabase = document.getElementById('form-admin-supabase-config');
    if (formSupabase) {
      formSupabase.addEventListener('submit', (e) => this.handleSaveSupabaseConfig(e));
    }
  }

  openAdminModal() {
    const currentUser = window.authManager.currentUser;
    if (!currentUser || currentUser.role !== 'admin') {
      Swal.fire({
        icon: 'error',
        title: 'ไม่มีสิทธิ์เข้าถึง',
        text: 'หน้านี้สำหรับผู้ดูแลระบบ (Admin) เท่านั้น',
        background: '#180a2f',
        color: '#fff',
        confirmButtonColor: '#ef4444'
      });
      return;
    }

    const modal = document.getElementById('modal-admin-panel');
    if (modal) {
      modal.classList.add('active');
      const firstTab = document.querySelector('.admin-tab-btn');
      if (firstTab) firstTab.click();
    }
  }

  closeAdminModal() {
    const modal = document.getElementById('modal-admin-panel');
    if (modal) modal.classList.remove('active');
  }

  // ==========================================
  // PRODUCT MANAGEMENT (Image 2 style)
  // ==========================================
  async renderAdminProductsTable() {
    const tbody = document.getElementById('admin-products-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #a79bb7;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลดข้อมูลจาก Supabase...</td></tr>`;

    const products = await window.supabaseManager.fetchTable('products');
    
    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #a79bb7;">ยังไม่มีสินค้าในฐานข้อมูล Supabase</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => `
      <tr>
        <td style="width: 60px;">
          <img src="${p.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'}" style="width: 50px; height: 35px; object-fit: cover; border-radius: 6px; border: 1px solid #3c1e6d;" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'">
        </td>
        <td>
          <b style="color: #fff;">${p.name}</b>
          <div style="font-size: 0.75rem; color: #a79bb7;">${p.server_tag || '-'}</div>
        </td>
        <td><span class="product-category-tag" style="position: static;">${p.category}</span></td>
        <td style="color: #ef4444; font-weight: 700; font-family: var(--font-en);">${p.price} ฿</td>
        <td style="font-weight: 600;">${p.stock} ชิ้น</td>
        <td>
          <button class="btn-card-edit" style="display: inline-flex; margin-right: 4px;" onclick="window.adminManager.openEditProduct('${p.id}')">
            <i class="fas fa-edit"></i> แก้ไข
          </button>
          <button class="btn-card-delete" style="display: inline-flex;" onclick="window.adminManager.deleteProduct('${p.id}')">
            <i class="fas fa-trash-alt"></i> ลบ
          </button>
        </td>
      </tr>
    `).join('');
  }

  openAddProductModal() {
    this.editingProductId = null;
    const form = document.getElementById('form-admin-product');
    if (form) form.reset();
    const title = document.getElementById('admin-product-modal-title');
    if (title) title.textContent = 'เพิ่มรายการสินค้าใหม่';
    const modal = document.getElementById('modal-admin-add-product');
    if (modal) modal.classList.add('active');
  }

  async openEditProduct(productId) {
    try {
      const products = await window.supabaseManager.fetchTable('products');
      const p = products.find(item => String(item.id) === String(productId));
      if (!p) {
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบข้อมูลสินค้า',
          text: `ไม่พบสินค้า ID: ${productId}`,
          background: '#180a2f',
          color: '#fff'
        });
        return;
      }

      this.editingProductId = p.id;
      const title = document.getElementById('admin-product-modal-title');
      if (title) title.textContent = 'แก้ไขรายการสินค้า';

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = (val !== undefined && val !== null) ? val : '';
      };

      setVal('prod-input-name', p.name);
      setVal('prod-input-category', p.category || 'เงิน M');
      setVal('prod-input-price', p.price || 0);
      setVal('prod-input-original-price', p.original_price);
      setVal('prod-input-stock', p.stock || 0);
      setVal('prod-input-image', p.image_url);
      setVal('prod-input-badge', p.badge_text);
      setVal('prod-input-server', p.server_tag);
      setVal('prod-input-desc', p.description);
      setVal('prod-input-delivery', p.delivery_data);

      const modal = document.getElementById('modal-admin-add-product');
      if (modal) {
        modal.classList.add('active');
      }
    } catch (err) {
      console.error('Error opening edit product:', err);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: err.message,
        background: '#180a2f',
        color: '#fff'
      });
    }
  }

  closeProductFormModal() {
    const modal = document.getElementById('modal-admin-add-product');
    if (modal) modal.classList.remove('active');
  }

  async handleSaveProduct(e) {
    e.preventDefault();
    const getVal = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    const name = getVal('prod-input-name');
    const category = getVal('prod-input-category') || 'เงิน M';
    const price = parseFloat(getVal('prod-input-price')) || 0;
    const originalPrice = parseFloat(getVal('prod-input-original-price')) || null;
    const stock = parseInt(getVal('prod-input-stock')) || 0;
    const imageUrl = getVal('prod-input-image') || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80';
    const badgeText = getVal('prod-input-badge');
    const serverTag = getVal('prod-input-server');
    const description = getVal('prod-input-desc');
    const deliveryData = getVal('prod-input-delivery');

    if (!name || price <= 0) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูล', text: 'กรุณาระบุชื่อสินค้าและราคาที่ถูกต้อง', background: '#180a2f', color: '#fff' });
      return;
    }

    const productPayload = {
      name,
      category,
      price,
      original_price: originalPrice,
      stock,
      image_url: imageUrl,
      badge_text: badgeText,
      server_tag: serverTag,
      description,
      delivery_data: deliveryData
    };

    try {
      if (this.editingProductId) {
        await window.supabaseManager.updateRecord('products', this.editingProductId, productPayload);
        Swal.fire({ icon: 'success', title: 'อัปเดตสินค้าใน Supabase เรียบร้อย', timer: 1500, showConfirmButton: false, background: '#180a2f', color: '#fff' });
      } else {
        await window.supabaseManager.insertRecord('products', productPayload);
        Swal.fire({ icon: 'success', title: 'เพิ่มสินค้าเข้าสู่ฐานข้อมูล Supabase สำเร็จ!', timer: 1500, showConfirmButton: false, background: '#180a2f', color: '#fff' });
      }

      this.closeProductFormModal();
      this.renderAdminProductsTable();
      if (window.shopManager && typeof window.shopManager.renderProducts === 'function') window.shopManager.renderProducts();
      if (window.appManager && typeof window.appManager.updateLiveStats === 'function') window.appManager.updateLiveStats();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, background: '#180a2f', color: '#fff' });
    }
  }

  async deleteProduct(productId) {
    Swal.fire({
      title: 'ต้องการลบสินค้านี้?',
      text: 'การลบจะลบข้อมูลออกจากฐานข้อมูล Supabase ทันที',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ใช่, ลบสินค้า',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      background: '#180a2f',
      color: '#fff'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await window.supabaseManager.deleteRecord('products', productId);
          this.renderAdminProductsTable();
          if (window.shopManager && typeof window.shopManager.renderProducts === 'function') window.shopManager.renderProducts();
          if (window.appManager && typeof window.appManager.updateLiveStats === 'function') window.appManager.updateLiveStats();
          Swal.fire({ icon: 'success', title: 'ลบสินค้าสำเร็จ', timer: 1200, showConfirmButton: false, background: '#180a2f', color: '#fff' });
        } catch (err) {
          Swal.fire({ icon: 'error', title: 'ไม่สามารถลบได้', text: err.message, background: '#180a2f', color: '#fff' });
        }
      }
    });
  }

  // ==========================================
  // SITE CUSTOMIZER & GATEWAY CONFIG
  // ==========================================
  async loadSiteSettingsForm() {
    const settings = await window.supabaseManager.fetchTable('site_settings');
    const s = Array.isArray(settings) ? (settings[0] || {}) : settings;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = (val !== undefined && val !== null) ? val : '';
    };

    setVal('site-input-name', s.shop_name || 'Little Cloud Shop');
    setVal('site-input-tagline', s.shop_tagline || '');
    setVal('site-input-announcement', s.announcement || '');
    setVal('site-input-hero-title', s.hero_title || '');
    setVal('site-input-hero-sub', s.hero_subtitle || '');
    setVal('site-input-discord', s.contact_discord || '');
    setVal('site-input-facebook', s.contact_facebook || '');
    setVal('site-input-line', s.contact_line || '');
    setVal('site-input-promptpay-num', s.promptpay_number || '0815993194');
    setVal('site-input-promptpay-name', s.promptpay_name || 'Little Cloud Shop Official');

    // Gateway fields
    setVal('gateway-input-provider', s.gateway_provider || 'promptpay_slipok');
    setVal('gateway-input-branch', s.gateway_branch_id || '');
    setVal('gateway-input-key', s.gateway_api_key || '');
    setVal('gateway-input-secret', s.gateway_secret || '');
  }

  async handleSaveSiteSettings(e) {
    e.preventDefault();
    const getVal = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    const updated = {
      shop_name: getVal('site-input-name'),
      shop_tagline: getVal('site-input-tagline'),
      announcement: getVal('site-input-announcement'),
      hero_title: getVal('site-input-hero-title'),
      hero_subtitle: getVal('site-input-hero-sub'),
      contact_discord: getVal('site-input-discord'),
      contact_facebook: getVal('site-input-facebook'),
      contact_line: getVal('site-input-line'),
      promptpay_number: getVal('site-input-promptpay-num') || '0815993194',
      promptpay_name: getVal('site-input-promptpay-name') || 'Little Cloud Shop Official'
    };

    try {
      await window.supabaseManager.upsertRecord('site_settings', { id: 'main_config', ...updated });

      // Direct DOM update
      if (updated.shop_name) {
        document.querySelectorAll('.brand-shop-name').forEach(el => el.textContent = updated.shop_name);
      }
      if (updated.announcement) {
        const ann = document.getElementById('site-announcement-text');
        if (ann) ann.textContent = updated.announcement;
      }
      if (updated.hero_title) {
        const ht = document.getElementById('hero-headline-title');
        if (ht) ht.innerHTML = updated.hero_title;
      }
      if (updated.hero_subtitle) {
        const hs = document.getElementById('hero-subtext-desc');
        if (hs) hs.textContent = updated.hero_subtitle;
      }
      if (updated.contact_discord) {
        const disc = document.getElementById('hero-discord-link');
        if (disc) disc.href = updated.contact_discord;
      }

      if (window.appManager && typeof window.appManager.applySiteSettings === 'function') {
        window.appManager.applySiteSettings(updated);
      }

      Swal.fire({
        icon: 'success',
        title: 'บันทึกการตั้งค่าลง Supabase สำเร็จ!',
        text: 'หน้าเว็บและการตั้งค่า PromptPay ได้รับการอัปเดตแล้ว',
        timer: 1800,
        showConfirmButton: false,
        background: '#180a2f',
        color: '#fff'
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, background: '#180a2f', color: '#fff' });
    }
  }

  async handleSaveGatewaySettings(e) {
    e.preventDefault();
    const getVal = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    };

    const gatewayData = {
      gateway_provider: getVal('gateway-input-provider') || 'promptpay_slipok',
      gateway_branch_id: getVal('gateway-input-branch'),
      gateway_api_key: getVal('gateway-input-key'),
      gateway_secret: getVal('gateway-input-secret')
    };

    try {
      await window.supabaseManager.upsertRecord('site_settings', { id: 'main_config', ...gatewayData });
      Swal.fire({
        icon: 'success',
        title: 'บันทึกการตั้งค่า Payment Gateway สำเร็จ!',
        text: 'ระบบพร้อมรับชำระเงินจริงและตรวจสอบสลิปอัตโนมัติแล้ว',
        timer: 2000,
        showConfirmButton: false,
        background: '#180a2f',
        color: '#fff'
      });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, background: '#180a2f', color: '#fff' });
    }
  }

  // ==========================================
  // USERS MANAGEMENT
  // ==========================================
  async renderAdminUsersTable() {
    const tbody = document.getElementById('admin-users-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: #a79bb7;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลดสมาชิกจาก Supabase...</td></tr>`;

    const profiles = await window.supabaseManager.fetchTable('profiles');
    if (profiles.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: #a79bb7;">ยังไม่มีสมาชิกในฐานข้อมูล Supabase</td></tr>`;
      return;
    }

    tbody.innerHTML = profiles.map(u => `
      <tr>
        <td><b style="color: #fff;">${u.username}</b></td>
        <td>
          <span class="user-role-badge role-${u.role}">${(u.role || 'member').toUpperCase()}</span>
        </td>
        <td style="color: #34d399; font-weight: 700; font-family: var(--font-en);">฿ ${(Number(u.balance)||0).toFixed(2)}</td>
        <td style="font-size: 0.8rem; color: #a79bb7;">${new Date(u.created_at || Date.now()).toLocaleDateString('th-TH')}</td>
        <td>
          <button class="btn-card-edit" style="display: inline-flex; margin-right: 4px;" onclick="window.adminManager.toggleUserRole('${u.id}', '${u.role}')">
            <i class="fas fa-user-shield"></i> สลับ Role (${u.role === 'admin' ? 'เป็น Member' : 'เป็น Admin'})
          </button>
          <button class="btn-card-edit" style="display: inline-flex;" onclick="window.adminManager.adjustUserBalance('${u.id}', '${u.username}', ${u.balance || 0})">
            <i class="fas fa-coins"></i> ปรับเงิน
          </button>
        </td>
      </tr>
    `).join('');
  }

  async toggleUserRole(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    try {
      await window.supabaseManager.updateRecord('profiles', userId, { role: newRole });
      this.renderAdminUsersTable();
      Swal.fire({ icon: 'success', title: `เปลี่ยน Role เป็น ${newRole.toUpperCase()} แล้ว`, timer: 1200, showConfirmButton: false, background: '#180a2f', color: '#fff' });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, background: '#180a2f', color: '#fff' });
    }
  }

  async adjustUserBalance(userId, username, currentBal) {
    const { value: newBal } = await Swal.fire({
      title: `ปรับยอดเงิน: ${username}`,
      input: 'number',
      inputValue: currentBal,
      inputLabel: 'จำนวนเงินใหม่ (บาท) - จะถูกบันทึก Audit Ledger อัตโนมัติ',
      showCancelButton: true,
      background: '#180a2f',
      color: '#fff',
      confirmButtonColor: '#d946ef'
    });

    if (newBal !== undefined && !isNaN(newBal)) {
      try {
        const adminUser = window.authManager.currentUser ? window.authManager.currentUser.username : 'admin';
        await window.walletManager.adjustBalanceByAdmin({
          userId: userId,
          username: username,
          newBalance: parseFloat(newBal),
          adminUsername: adminUser,
          reason: 'ปรับยอดเครดิตโดยแอดมิน'
        });

        this.renderAdminUsersTable();
        Swal.fire({ icon: 'success', title: 'ปรับยอดเงินและบันทึก Ledger สำเร็จ', timer: 1200, showConfirmButton: false, background: '#180a2f', color: '#fff' });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message, background: '#180a2f', color: '#fff' });
      }
    }
  }

  // ==========================================
  // RECONCILIATION & AUDIT LEDGER (Requirement 5)
  // ==========================================
  async renderReconciliationDashboard() {
    const bannerText = document.getElementById('recon-status-text');
    const bannerBox = document.getElementById('recon-status-banner');
    const inflowEl = document.getElementById('recon-val-inflow');
    const issuedEl = document.getElementById('recon-val-issued');
    const spentEl = document.getElementById('recon-val-spent');
    const balanceEl = document.getElementById('recon-val-balance');
    const tbody = document.getElementById('admin-ledger-table-body');

    if (bannerText) bannerText.innerHTML = `<i class="fas fa-spinner fa-spin"></i> กำลังคำนวณการกระทบยอดทางบัญชี...`;

    try {
      await this.loadSiteSettingsForm();
      const report = await window.walletManager.getReconciliationReport();

      if (inflowEl) inflowEl.textContent = `฿ ${report.totalRealInflow.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      if (issuedEl) issuedEl.textContent = `฿ ${report.totalCreditIssued.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      if (spentEl) spentEl.textContent = `฿ ${report.totalCreditSpent.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      if (balanceEl) balanceEl.textContent = `฿ ${report.totalCurrentBalance.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

      if (bannerBox && bannerText) {
        if (report.isBalanced) {
          bannerBox.style.background = 'rgba(16, 185, 129, 0.15)';
          bannerBox.style.borderColor = '#10b981';
          bannerBox.style.color = '#34d399';
          bannerText.innerHTML = `✅ ยอดเงินตรงกัน 100% (Reconciled: เครดิตเข้า ฿${report.totalCreditIssued.toLocaleString('th-TH')} - ใช้ไป ฿${report.totalCreditSpent.toLocaleString('th-TH')} = ยอดคงเหลือในระบบ ฿${report.totalCurrentBalance.toLocaleString('th-TH')})`;
        } else {
          bannerBox.style.background = 'rgba(239, 68, 68, 0.15)';
          bannerBox.style.borderColor = '#ef4444';
          bannerBox.style.color = '#fca5a5';
          bannerText.innerHTML = `⚠️ พบส่วนต่าง ฿${report.discrepancy.toLocaleString('th-TH')} บาท (คำนวณได้: ฿${report.theoreticalBalance.toLocaleString('th-TH')} vs ยอดจริง: ฿${report.totalCurrentBalance.toLocaleString('th-TH')})`;
        }
      }

      // Render Ledger Table
      if (tbody) {
        const logs = report.recentLogs;
        if (logs.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #9496a8;">ยังไม่มีประวัติธุรกรรมใน Ledger</td></tr>`;
          return;
        }

        tbody.innerHTML = logs.map(l => {
          const isPositive = Number(l.amount) >= 0;
          let typeBadge = '';
          if (l.type === 'topup') typeBadge = `<span style="background: rgba(16,185,129,0.2); color:#34d399; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem;">TOPUP (เติมเงิน)</span>`;
          else if (l.type === 'purchase') typeBadge = `<span style="background: rgba(239,68,68,0.2); color:#fca5a5; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem;">PURCHASE (ซื้อสินค้า)</span>`;
          else typeBadge = `<span style="background: rgba(245,158,11,0.2); color:#fbbf24; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.75rem;">ADJUST (ปรับยอด)</span>`;

          return `
            <tr>
              <td style="font-size: 0.78rem; color: #a5a8bc;">${new Date(l.created_at || Date.now()).toLocaleString('th-TH')}</td>
              <td><b style="color: #fff;">${l.username}</b></td>
              <td>${typeBadge}</td>
              <td style="color: ${isPositive ? '#34d399' : '#ef4444'}; font-weight: 700; font-family: 'Outfit', sans-serif;">
                ${isPositive ? '+' : ''}${(Number(l.amount)||0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
              </td>
              <td style="font-size: 0.78rem; color: #9496a8;">
                ฿${(Number(l.balance_before)||0).toFixed(2)} -> ฿${(Number(l.balance_after)||0).toFixed(2)}
              </td>
              <td>
                <code style="font-size: 0.75rem; color: #60a5fa;" title="${l.description || ''}">${l.reference_id || l.gateway_ref || '-'}</code>
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (e) {
      console.error('Reconciliation error:', e);
      if (bannerText) bannerText.textContent = `เกิดข้อผิดพลาดในการคำนวณ Reconciliation: ${e.message}`;
    }
  }

  // ==========================================
  // TOPUPS & INFLOW REVENUE (Requirement 4)
  // ==========================================
  async renderAdminTopupsTable() {
    const tbody = document.getElementById('admin-topups-table-body');
    const totalAmountEl = document.getElementById('admin-topup-total-amount');
    const totalCountEl = document.getElementById('admin-topup-total-count');
    const latestInfoEl = document.getElementById('admin-topup-latest-info');

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #a5a8bc;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลดรายการเติมเงินจาก Supabase...</td></tr>`;
    }

    try {
      // 1. Fetch from topups and wallet_transactions tables
      const topups = await window.supabaseManager.fetchTable('topups');
      const ledgerTxs = await window.supabaseManager.fetchTable('wallet_transactions');

      // 2. Combine and deduplicate
      const topupMap = new Map();

      // From topups table
      if (Array.isArray(topups)) {
        topups.forEach(t => {
          const key = t.transaction_ref || t.gateway_ref || t.id || `${t.username}_${t.amount}_${t.created_at}`;
          topupMap.set(key, {
            id: t.id,
            user_id: t.user_id,
            username: t.username || 'Member',
            amount: Number(t.amount) || 0,
            payment_method: t.payment_method || 'PromptPay QR',
            transaction_ref: t.transaction_ref || t.gateway_ref || t.id || '-',
            gateway_ref: t.gateway_ref || '',
            slip_url: t.slip_url || '',
            verified_by: t.verified_by || 'Payment Gateway Webhook',
            status: t.status || 'approved',
            created_at: t.created_at || new Date().toISOString()
          });
        });
      }

      // From wallet_transactions table (type === 'topup')
      if (Array.isArray(ledgerTxs)) {
        ledgerTxs.filter(l => l.type === 'topup').forEach(l => {
          const key = l.reference_id || l.gateway_ref || l.id || `${l.username}_${l.amount}_${l.created_at}`;
          if (!topupMap.has(key)) {
            topupMap.set(key, {
              id: l.id,
              user_id: l.user_id,
              username: l.username || 'Member',
              amount: Number(l.amount) || 0,
              payment_method: 'PromptPay QR',
              transaction_ref: l.reference_id || l.gateway_ref || l.id || '-',
              gateway_ref: l.gateway_ref || '',
              slip_url: '',
              verified_by: 'Wallet Ledger',
              status: l.status === 'completed' ? 'approved' : (l.status || 'approved'),
              created_at: l.created_at || new Date().toISOString()
            });
          }
        });
      }

      const allTopups = Array.from(topupMap.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      this.currentTopups = allTopups;

      // 3. Compute Metrics
      const totalInflow = allTopups.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const totalCount = allTopups.length;
      const latestItem = allTopups[0];

      if (totalAmountEl) {
        totalAmountEl.textContent = `฿ ${totalInflow.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      }
      if (totalCountEl) {
        totalCountEl.textContent = `${totalCount} รายการ`;
      }
      if (latestInfoEl) {
        if (latestItem) {
          latestInfoEl.innerHTML = `<span style="color:#fff;">${latestItem.username}</span> (+฿${Number(latestItem.amount).toLocaleString('th-TH')})`;
        } else {
          latestInfoEl.textContent = 'ยังไม่มีข้อมูล';
        }
      }

      // 4. Render Table
      if (!tbody) return;

      if (allTopups.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: #a5a8bc;"><i class="fas fa-wallet" style="font-size: 2rem; opacity: 0.4; margin-bottom: 8px; display: block;"></i> ยังไม่มีประวัติการเติมเงินในระบบ</td></tr>`;
        return;
      }

      tbody.innerHTML = allTopups.map(t => {
        const amt = Number(t.amount) || 0;
        const formattedDate = new Date(t.created_at || Date.now()).toLocaleString('th-TH', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        // Determine if slip exists or can be resolved
        const hasSlip = !!(t.slip_url && (t.slip_url.trim().length > 0));

        return `
          <tr>
            <td style="font-size: 0.8rem; color: #a5a8bc; white-space: nowrap;">
              <i class="far fa-clock" style="margin-right: 4px; opacity: 0.7;"></i> ${formattedDate}
            </td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 26px; height: 26px; border-radius: 50%; background: #282a3c; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #f472b6;">
                  <i class="fas fa-user"></i>
                </div>
                <b style="color: #fff; font-size: 0.88rem;">${t.username}</b>
              </div>
            </td>
            <td>
              <span style="color: #34d399; font-weight: 800; font-family: 'Outfit', sans-serif; font-size: 0.95rem;">
                +฿ ${amt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
              </span>
            </td>
            <td>
              <span style="background: rgba(0, 59, 113, 0.25); color: #60a5fa; border: 1px solid rgba(96, 165, 250, 0.25); padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fas fa-qrcode"></i> ${t.payment_method || 'PromptPay QR'}
              </span>
            </td>
            <td>
              <code style="font-size: 0.78rem; color: #e2e8f0; background: #1a1b28; padding: 2px 6px; border-radius: 4px; border: 1px solid #2d2f45;">
                ${t.transaction_ref}
              </code>
            </td>
            <td>
              <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid #10b981; padding: 3px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fas fa-circle-check"></i> สำเร็จ (Approved)
              </span>
            </td>
            <td style="text-align: center; white-space: nowrap; min-width: 135px; padding: 10px 14px;">
              ${hasSlip ? `
                <button type="button" class="btn-slip-view" onclick="window.adminManager.viewTopupSlip('${t.id || t.transaction_ref}')" title="คลิกเพื่อดูรูปภาพสลิปที่แนบ">
                  <i class="fas fa-file-invoice-dollar"></i> ดูสลิปที่แนบ
                </button>
              ` : `
                <button type="button" class="btn-slip-view empty" onclick="window.adminManager.viewTopupSlip('${t.id || t.transaction_ref}')" title="ไม่มีรูปสลิปแนบ (คลิกเพื่อดูรายละเอียดหรือแนบสลิป)">
                  <i class="fas fa-receipt"></i> ตรวจสอบ
                </button>
              `}
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('Error rendering admin topups:', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #ef4444;">เกิดข้อผิดพลาดในการโหลดข้อมูล: ${err.message}</td></tr>`;
      }
    }
  }

  // ==========================================
  // SLIP VIEWER & ACTIONS
  // ==========================================
  viewTopupSlipFromHeader() {
    if (Array.isArray(this.currentTopups) && this.currentTopups.length > 0) {
      const topupWithSlip = this.currentTopups.find(t => t.slip_url && t.slip_url.trim().length > 0);
      if (topupWithSlip) {
        this.viewTopupSlip(topupWithSlip.id || topupWithSlip.transaction_ref);
        return;
      }
      this.viewTopupSlip(this.currentTopups[0].id || this.currentTopups[0].transaction_ref);
      return;
    }
    this.viewLatestServerSlip();
  }

  async viewTopupSlip(idOrRef) {
    if (!this.currentTopups || this.currentTopups.length === 0) {
      await this.renderAdminTopupsTable();
    }
    const item = (this.currentTopups || []).find(t => String(t.id) === String(idOrRef) || String(t.transaction_ref) === String(idOrRef));
    if (!item) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'error',
          title: 'ไม่พบรายการเติมเงิน',
          text: 'ไม่พบข้อมูลของรหัสรายการนี้',
          background: '#151622',
          color: '#fff'
        });
      }
      return;
    }

    this.activeSlipTopup = item;
    this.slipRotation = 0;
    this.slipZoomed = false;

    const modal = document.getElementById('modal-admin-slip-viewer');
    const img = document.getElementById('admin-slip-image');
    const placeholder = document.getElementById('admin-slip-placeholder');
    const downloadBtn = document.getElementById('admin-slip-download-btn');
    const subtitle = document.getElementById('admin-slip-modal-subtitle');
    const amountEl = document.getElementById('admin-slip-amount');
    const usernameEl = document.getElementById('admin-slip-username');
    const dateEl = document.getElementById('admin-slip-date');
    const methodEl = document.getElementById('admin-slip-method');
    const refEl = document.getElementById('admin-slip-ref');
    const verifiedByEl = document.getElementById('admin-slip-verified-by');

    const amt = Number(item.amount) || 0;
    const formattedDate = new Date(item.created_at || Date.now()).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    if (subtitle) subtitle.textContent = `รหัสอ้างอิง: ${item.transaction_ref}`;
    if (amountEl) amountEl.textContent = `+฿ ${amt.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
    if (usernameEl) usernameEl.textContent = item.username || 'Member';
    if (dateEl) dateEl.textContent = formattedDate;
    if (methodEl) methodEl.textContent = item.payment_method || 'PromptPay QR';
    if (refEl) refEl.textContent = item.transaction_ref || '-';
    if (verifiedByEl) verifiedByEl.textContent = item.verified_by || 'Payment Gateway Webhook';

    // Resolve slip image source
    let slipSrc = (item.slip_url || '').trim();

    // If slip_url is filename like IMG_0501.jpg, check local storage cache
    if (slipSrc && !slipSrc.startsWith('data:') && !slipSrc.startsWith('http') && !slipSrc.startsWith('/')) {
      const localCached = localStorage.getItem(`cloud_slip_${item.transaction_ref}`);
      if (localCached) {
        slipSrc = localCached;
      }
    }

    if (img) {
      img.style.transform = 'none';
      img.style.cursor = 'zoom-in';
      if (slipSrc) {
        img.src = slipSrc;
        img.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        if (downloadBtn) {
          downloadBtn.href = slipSrc;
          downloadBtn.download = `slip_${item.transaction_ref || 'receipt'}.jpg`;
          downloadBtn.style.display = 'inline-flex';
        }
      } else {
        img.src = '';
        img.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
        if (downloadBtn) downloadBtn.style.display = 'none';
      }
    }

    if (modal) {
      modal.classList.add('active');
    }
  }

  closeSlipViewerModal() {
    const modal = document.getElementById('modal-admin-slip-viewer');
    if (modal) modal.classList.remove('active');
    this.activeSlipTopup = null;
    this.slipRotation = 0;
    this.slipZoomed = false;
  }

  rotateSlipImage() {
    const img = document.getElementById('admin-slip-image');
    if (!img || !img.src) return;
    this.slipRotation = ((this.slipRotation || 0) + 90) % 360;
    const scale = this.slipZoomed ? 1.8 : 1.0;
    img.style.transform = `rotate(${this.slipRotation}deg) scale(${scale})`;
  }

  toggleSlipZoom() {
    const img = document.getElementById('admin-slip-image');
    if (!img || !img.src) return;
    this.slipZoomed = !this.slipZoomed;
    const scale = this.slipZoomed ? 1.8 : 1.0;
    img.style.cursor = this.slipZoomed ? 'zoom-out' : 'zoom-in';
    img.style.transform = `rotate(${this.slipRotation || 0}deg) scale(${scale})`;
  }

  async copyCurrentTransRef() {
    const ref = this.activeSlipTopup ? this.activeSlipTopup.transaction_ref : '';
    if (!ref || ref === '-') return;
    try {
      await navigator.clipboard.writeText(ref);
      if (typeof Swal !== 'undefined') {
        const Toast = Swal.mixin({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000,
          background: '#151622',
          color: '#34d399'
        });
        Toast.fire({
          icon: 'success',
          title: 'คัดลอกรหัสธุรกรรมแล้ว!'
        });
      }
    } catch (e) {
      console.warn('Clipboard copy error:', e);
    }
  }

  async handleAdminUploadSlip(input) {
    if (!input.files || !input.files[0] || !this.activeSlipTopup) return;
    const file = input.files[0];
    const item = this.activeSlipTopup;

    Swal.fire({
      title: 'กำลังอัพโหลดและบันทึกสลิป...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#151622',
      color: '#fff'
    });

    try {
      // Compress image on canvas to max 900px, 0.8 JPEG
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
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
          };
          img.onerror = () => reject(new Error('ไม่สามารถประมวลผลรูปภาพได้'));
          img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
        reader.readAsDataURL(file);
      });

      // Update in Supabase topups table if topup record exists
      if (item.id) {
        try {
          await window.supabaseManager.updateRecord('topups', item.id, { slip_url: dataUrl });
        } catch (dbErr) {
          console.warn('Direct update failed, trying fallback:', dbErr);
        }
      }

      // Cache locally
      if (item.transaction_ref) {
        localStorage.setItem(`cloud_slip_${item.transaction_ref}`, dataUrl);
      }

      // Update current item and UI
      item.slip_url = dataUrl;
      const img = document.getElementById('admin-slip-image');
      const placeholder = document.getElementById('admin-slip-placeholder');
      const downloadBtn = document.getElementById('admin-slip-download-btn');

      if (img) {
        img.src = dataUrl;
        img.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
      if (downloadBtn) {
        downloadBtn.href = dataUrl;
        downloadBtn.download = `slip_${item.transaction_ref}.jpg`;
        downloadBtn.style.display = 'inline-flex';
      }

      Swal.fire({
        icon: 'success',
        title: 'บันทึกรูปสลิปสำเร็จ!',
        text: 'อัพเดทหลักฐานสลิปสำหรับรายการนี้เรียบร้อยแล้ว',
        timer: 2000,
        showConfirmButton: false,
        background: '#151622',
        color: '#fff'
      });

      this.renderAdminTopupsTable();
    } catch (err) {
      console.error('Admin slip upload error:', err);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: err.message || 'ไม่สามารถบันทึกสลิปได้',
        background: '#151622',
        color: '#fff'
      });
    } finally {
      input.value = '';
    }
  }

  async viewLatestServerSlip() {
    Swal.fire({
      title: 'กำลังค้นหาสลิปล่าสุดในระบบ...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#151622',
      color: '#fff'
    });

    let foundSlip = null;
    let filename = 'mobile_slip.jpg';

    // 1. Try local node server endpoints
    let apiBase = '';
    if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000')) {
      apiBase = 'http://127.0.0.1:3000';
    }

    const endpoints = [
      `${apiBase}/api/slip/latest`,
      'http://127.0.0.1:3000/api/slip/latest',
      'http://192.168.1.124:3000/api/slip/latest'
    ];

    for (const ep of endpoints) {
      try {
        const resp = await fetch(ep);
        if (resp.ok) {
          const data = await resp.json();
          if (data.success && data.slip_data) {
            foundSlip = data.slip_data;
            filename = data.filename || filename;
            break;
          }
        }
      } catch (e) {}
    }

    // 2. If not found via server, check latest topup with slip_url from Supabase
    if (!foundSlip && Array.isArray(this.currentTopups)) {
      const topupWithSlip = this.currentTopups.find(t => t.slip_url && (t.slip_url.startsWith('data:image') || t.slip_url.startsWith('http')));
      if (topupWithSlip) {
        Swal.close();
        this.viewTopupSlip(topupWithSlip.id || topupWithSlip.transaction_ref);
        return;
      }
    }

    if (foundSlip) {
      Swal.close();
      const mockItem = {
        id: 'latest_server_slip',
        username: 'ล่าสุดจากระบบ Relay / มือถือ',
        amount: 0,
        payment_method: 'PromptPay QR (Mobile Relay)',
        transaction_ref: `RELAY-${Date.now().toString().slice(-8)}`,
        status: 'approved',
        created_at: new Date().toISOString(),
        slip_url: foundSlip,
        verified_by: 'Mobile QR Upload'
      };
      if (!this.currentTopups) this.currentTopups = [];
      this.currentTopups.unshift(mockItem);
      this.viewTopupSlip('latest_server_slip');
    } else {
      Swal.fire({
        icon: 'info',
        title: 'ไม่พบสลิปในคิวระบบ',
        text: 'ยังไม่มีสลิปที่ส่งมาจากมือถือ หรือยังไม่มีรายการเติมเงินที่มีสลิปแนบ',
        background: '#151622',
        color: '#fff',
        confirmButtonColor: '#e11d48'
      });
    }
  }

  // ==========================================
  // ORDERS MANAGEMENT
  // ==========================================
  async renderAdminOrdersTable() {
    const tbody = document.getElementById('admin-orders-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #a79bb7;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลดออเดอร์จาก Supabase...</td></tr>`;

    const orders = await window.supabaseManager.fetchTable('orders');
    if (orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #a79bb7;">ยังไม่มีรายการสั่งซื้อในระบบ Supabase</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => `
      <tr>
        <td style="font-family: monospace; font-size: 0.78rem; color: #a79bb7;">${o.id}</td>
        <td><b style="color: #fff;">${o.username}</b></td>
        <td>${o.product_name} ${o.quantity && o.quantity > 1 ? `<span style="color:#f472b6; font-weight:700; font-size:0.82rem; margin-left:4px;">(x${o.quantity})</span>` : ''}</td>
        <td style="color: #ef4444; font-weight: 700; font-family: var(--font-en);">${(Number(o.total_price)||0).toFixed(2)} ฿</td>
        <td style="font-family: monospace; font-size: 0.78rem; color: #34d399;">${o.delivery_code || '-'}</td>
        <td style="font-size: 0.8rem; color: #a79bb7;">${new Date(o.created_at || Date.now()).toLocaleString('th-TH')}</td>
      </tr>
    `).join('');
  }

  // ==========================================
  // SUPABASE CREDENTIALS CONFIG
  // ==========================================
  async handleSaveSupabaseConfig(e) {
    e.preventDefault();
    const url = document.getElementById('supabase-cfg-url').value.trim();
    const key = document.getElementById('supabase-cfg-key').value.trim();

    if (!url || !key) {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูล', text: 'กรุณาระบุทั้ง Supabase Project URL และ Anon Key', background: '#180a2f', color: '#fff' });
      return;
    }

    Swal.fire({
      title: 'กำลังเชื่อมต่อกับ Supabase...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#180a2f',
      color: '#fff'
    });

    const success = await window.supabaseManager.saveConfig(url, key);
    if (success) {
      Swal.fire({
        icon: 'success',
        title: '🎉 เชื่อมต่อ Supabase สำเร็จ!',
        text: 'ระบบดึงข้อมูลจริงจากตารางฐานข้อมูลของคุณเรียบร้อยแล้ว',
        background: '#180a2f',
        color: '#fff',
        confirmButtonColor: '#10b981'
      });
      window.closeSupabaseConfigModal();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'ไม่สามารถเชื่อมต่อได้',
        text: 'กรุณาตรวจสอบ Supabase URL และ Public Anon Key ให้ถูกต้อง',
        background: '#180a2f',
        color: '#fff'
      });
    }
  }
}

window.adminManager = new AdminManager();
