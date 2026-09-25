// ==============================================================================
// LITTLE CLOUD / JELLY TOWN - REAL SHOP ENGINE (Image 3 Card Style)
// ==============================================================================

class ShopManager {
  constructor() {
    this.currentCategory = 'all';
    this.searchQuery = '';
    this.sortBy = 'newest';
    this.bindEvents();
  }

  bindEvents() {
    // Category Filter Pills (Image 3)
    document.querySelectorAll('.cat-pill[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-pill[data-cat]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCategory = btn.dataset.cat;
        this.renderProducts();
      });
    });

    // Search Input
    const searchInput = document.getElementById('shop-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderProducts();
      });
    }

    // Sort Dropdown
    const sortSelect = document.getElementById('shop-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.renderProducts();
      });
    }
  }

  async getProducts() {
    return await window.supabaseManager.fetchTable('products');
  }

  async renderProducts() {
    const grid = document.getElementById('jelly-products-grid');
    if (!grid) return;

    if (!window.supabaseManager.isConnected) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: #151620; border: 1px dashed var(--primary-pink); border-radius: 20px;">
          <div style="font-size: 2.5rem; margin-bottom: 10px;">🔌</div>
          <h3 style="color: #fff; margin-bottom: 6px;">กรุณาเชื่อมต่อ Supabase Database</h3>
          <p style="color: var(--text-muted); margin-bottom: 16px;">เชื่อมต่อเพื่อดึงรายการสินค้าจากตาราง products จริง</p>
          <button class="btn-pink" onclick="window.openSupabaseConfigModal()">
            <i class="fas fa-plug"></i> เชื่อมต่อ Supabase
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <i class="fas fa-spinner fa-spin" style="font-size: 1.8rem; color: #f472b6; margin-bottom: 8px;"></i>
        <p>กำลังดึงข้อมูลสินค้าจาก Supabase...</p>
      </div>
    `;

    let products = await this.getProducts();

    // Filter by category
    let filtered = products.filter(p => {
      let matchCat = false;
      if (this.currentCategory === 'all') matchCat = true;
      else if (this.currentCategory === 'discount') matchCat = p.original_price && p.original_price > p.price;
      else if (this.currentCategory === 'Skin Weapon') matchCat = p.category === 'สกินอาวุธ' || p.category === 'Skin Weapon';
      else matchCat = p.category === this.currentCategory;

      const matchSearch = !this.searchQuery ||
        p.name.toLowerCase().includes(this.searchQuery) ||
        (p.description && p.description.toLowerCase().includes(this.searchQuery)) ||
        (p.server_tag && p.server_tag.toLowerCase().includes(this.searchQuery));

      return matchCat && matchSearch;
    });

    // Sorting
    if (this.sortBy === 'price-asc') {
      filtered.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (this.sortBy === 'price-desc') {
      filtered.sort((a, b) => Number(b.price) - Number(a.price));
    }

    // Update count label
    const countLabel = document.getElementById('shop-item-count-text');
    if (countLabel) countLabel.textContent = `พบ ${filtered.length} รายการ`;

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-dim);">
          <i class="fas fa-box-open" style="font-size: 2.5rem; margin-bottom: 10px; display: block;"></i>
          <p>ไม่พบรายการสินค้าในหมวดหมู่นี้</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const price = Number(p.price) || 0;
      const stockText = p.stock > 100 ? '👁️ ไม่จำกัด' : `📦 คงเหลือ ${p.stock} ชิ้น`;
      const isOutOfStock = p.stock <= 0;

      return `
        <div class="jelly-product-card" data-id="${p.id}">
          <!-- Card Image (Image 3) -->
          <div class="jelly-card-media">
            <img src="${p.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'}" alt="${p.name}" class="jelly-card-img" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'">
            <span class="jelly-stock-badge">${stockText}</span>
          </div>

          <!-- Card Body (Image 3) -->
          <div class="jelly-card-body">
            <h3 class="jelly-card-title" title="${p.name}">${p.name}</h3>

            <div class="jelly-card-bottom">
              <div>
                <div class="jelly-price-label">PRICE</div>
                <div class="jelly-price-val">
                  ${price.toLocaleString('th-TH')} <span>บาท</span>
                </div>
              </div>

              <!-- Pink Plus Buy Button (Image 3) -->
              <button class="btn-card-add" onclick="window.shopManager.handleDirectBuy('${p.id}')" title="สั่งซื้อทันที" ${isOutOfStock ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
                <i class="fas fa-plus"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  async handleDirectBuy(productId) {
    const products = await this.getProducts();
    const product = products.find(p => String(p.id) === String(productId));
    if (!product) return;

    const user = window.authManager.currentUser;
    if (!user) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเข้าสู่ระบบ',
        text: 'คุณต้องเข้าสู่ระบบหรือสมัครสมาชิกก่อนทำการสั่งซื้อสินค้า',
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

    const unitPrice = Number(product.price) || 0;
    const currentStock = Number(product.stock) || 0;
    const userBalance = Number(user.balance) || 0;

    if (currentStock <= 0) {
      Swal.fire({
        icon: 'error',
        title: 'สินค้าหมดชั่วคราว',
        text: 'ขออภัย สินค้ารายการนี้หมดสต็อกแล้ว กรุณารอแอดมินเติมสินค้า',
        background: '#151622',
        color: '#fff',
        confirmButtonColor: '#e11d48'
      });
      return;
    }

    const maxStock = currentStock > 0 ? currentStock : 9999;

    const { value: selectedQty } = await Swal.fire({
      title: 'เลือกจำนวนสินค้าที่ต้องการสั่งซื้อ',
      html: `
        <div class="buy-modal-wrapper" style="text-align: left; padding: 4px 0;">
          <!-- Product Summary Box -->
          <div style="display: flex; gap: 14px; align-items: center; background: #1a1b28; padding: 12px 14px; border-radius: 12px; border: 1px solid #292b3d; margin-bottom: 16px;">
            <img src="${product.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'}" style="width: 56px; height: 56px; object-fit: cover; border-radius: 10px; border: 1px solid #3c1e6d;" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'">
            <div style="flex: 1; min-width: 0;">
              <h4 style="color: #fff; font-size: 1.05rem; font-weight: 700; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${product.name}</h4>
              <div style="display: flex; gap: 10px; align-items: center; font-size: 0.82rem;">
                <span style="color: #f472b6; font-weight: 700;">${unitPrice.toLocaleString('th-TH')} บาท/ชิ้น</span>
                <span style="color: #9496a8; background: #252738; padding: 2px 8px; border-radius: 4px;">📦 คงเหลือ ${currentStock} ชิ้น</span>
              </div>
            </div>
          </div>

          <!-- Quantity Selector -->
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 0.85rem; color: #a5a8bc; font-weight: 600; margin-bottom: 8px;">
              <i class="fas fa-cubes" style="color: #f472b6;"></i> ระบุจำนวนสินค้า:
            </label>
            <div style="display: flex; align-items: center; gap: 10px;">
              <button type="button" id="buy-qty-minus" style="width: 44px; height: 44px; border-radius: 10px; background: #252738; border: 1px solid #36394e; color: #fff; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                <i class="fas fa-minus"></i>
              </button>
              <input type="number" id="buy-qty-input" value="1" min="1" max="${maxStock}" style="flex: 1; height: 44px; background: #1a1b28; border: 1px solid #36394e; border-radius: 10px; color: #fff; text-align: center; font-size: 1.25rem; font-weight: 700; font-family: 'Outfit', sans-serif;">
              <button type="button" id="buy-qty-plus" style="width: 44px; height: 44px; border-radius: 10px; background: #252738; border: 1px solid #36394e; color: #fff; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                <i class="fas fa-plus"></i>
              </button>
            </div>

            <!-- Quick Presets -->
            <div style="display: flex; gap: 6px; margin-top: 10px;">
              <button type="button" class="quick-qty-btn" data-qty="1" style="flex: 1; padding: 6px; background: #1e1f2d; border: 1px solid #2d2f45; border-radius: 6px; color: #a5a8bc; font-size: 0.8rem; cursor: pointer;">1 ชิ้น</button>
              <button type="button" class="quick-qty-btn" data-qty="2" style="flex: 1; padding: 6px; background: #1e1f2d; border: 1px solid #2d2f45; border-radius: 6px; color: #a5a8bc; font-size: 0.8rem; cursor: pointer;">2 ชิ้น</button>
              <button type="button" class="quick-qty-btn" data-qty="5" style="flex: 1; padding: 6px; background: #1e1f2d; border: 1px solid #2d2f45; border-radius: 6px; color: #a5a8bc; font-size: 0.8rem; cursor: pointer;">5 ชิ้น</button>
              <button type="button" class="quick-qty-btn" data-qty="${maxStock}" style="flex: 1; padding: 6px; background: #1e1f2d; border: 1px solid #2d2f45; border-radius: 6px; color: #f472b6; font-size: 0.8rem; cursor: pointer;">ทั้งหมด (${maxStock})</button>
            </div>
          </div>

          <!-- Calculation Summary Box -->
          <div style="background: #11121c; padding: 14px; border-radius: 12px; border: 1px solid #25273a;">
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #9496a8; margin-bottom: 6px;">
              <span>ยอดเงินของคุณ:</span>
              <span style="color: #fff; font-weight: 600;">${userBalance.toLocaleString('th-TH')} บาท</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 6px;">
              <span>ราคารวมทั้งหมด:</span>
              <span id="buy-total-price-text" style="color: #f472b6; font-size: 1.15rem; font-family: 'Outfit', sans-serif;">${unitPrice.toLocaleString('th-TH')} บาท</span>
            </div>
            <div id="buy-balance-status-row" style="display: flex; justify-content: space-between; font-size: 0.82rem; border-top: 1px dashed #282a3c; padding-top: 6px; margin-top: 4px;">
              <span style="color: #9496a8;">คงเหลือหลังสั่งซื้อ:</span>
              <span id="buy-remaining-bal-text" style="color: #34d399; font-weight: 600;">${(userBalance - unitPrice).toLocaleString('th-TH')} บาท</span>
            </div>
            <div id="buy-insufficient-warning" style="display: none; margin-top: 8px; padding: 8px; background: rgba(239,68,68,0.15); border: 1px solid #ef4444; border-radius: 6px; color: #fca5a5; font-size: 0.8rem; text-align: center;">
              <i class="fas fa-exclamation-circle"></i> ยอดเงินไม่พอ ขาดอีก <span id="buy-missing-amt">0</span> บาท
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันการสั่งซื้อ',
      cancelButtonText: 'ยกเลิก',
      background: '#151622',
      color: '#fff',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#374151',
      didOpen: () => {
        const qtyInput = document.getElementById('buy-qty-input');
        const minusBtn = document.getElementById('buy-qty-minus');
        const plusBtn = document.getElementById('buy-qty-plus');
        const totalText = document.getElementById('buy-total-price-text');
        const remainingText = document.getElementById('buy-remaining-bal-text');
        const warningBox = document.getElementById('buy-insufficient-warning');
        const missingText = document.getElementById('buy-missing-amt');
        const confirmBtn = Swal.getConfirmButton();

        const updateCalc = () => {
          let qty = parseInt(qtyInput.value) || 1;
          if (qty < 1) qty = 1;
          if (qty > maxStock) qty = maxStock;
          qtyInput.value = qty;

          const total = qty * unitPrice;
          const remaining = userBalance - total;

          if (totalText) totalText.textContent = `${total.toLocaleString('th-TH')} บาท`;

          if (remaining >= 0) {
            if (remainingText) {
              remainingText.textContent = `${remaining.toLocaleString('th-TH')} บาท`;
              remainingText.style.color = '#34d399';
            }
            if (warningBox) warningBox.style.display = 'none';
            if (confirmBtn) {
              confirmBtn.disabled = false;
              confirmBtn.style.opacity = '1';
              confirmBtn.textContent = `ยืนยันสั่งซื้อ (${qty} ชิ้น)`;
            }
          } else {
            const missing = total - userBalance;
            if (remainingText) {
              remainingText.textContent = `ติดลบ ${Math.abs(remaining).toLocaleString('th-TH')} บาท`;
              remainingText.style.color = '#ef4444';
            }
            if (warningBox) {
              warningBox.style.display = 'block';
              if (missingText) missingText.textContent = missing.toLocaleString('th-TH');
            }
            if (confirmBtn) {
              confirmBtn.disabled = true;
              confirmBtn.style.opacity = '0.5';
              confirmBtn.textContent = 'ยอดเงินไม่เพียงพอ';
            }
          }
        };

        if (minusBtn) {
          minusBtn.addEventListener('click', () => {
            let val = parseInt(qtyInput.value) || 1;
            if (val > 1) {
              qtyInput.value = val - 1;
              updateCalc();
            }
          });
        }

        if (plusBtn) {
          plusBtn.addEventListener('click', () => {
            let val = parseInt(qtyInput.value) || 1;
            if (val < maxStock) {
              qtyInput.value = val + 1;
              updateCalc();
            }
          });
        }

        if (qtyInput) {
          qtyInput.addEventListener('input', updateCalc);
          qtyInput.addEventListener('change', updateCalc);
        }

        document.querySelectorAll('.quick-qty-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const targetQty = parseInt(btn.dataset.qty) || 1;
            qtyInput.value = Math.min(targetQty, maxStock);
            updateCalc();
          });
        });

        updateCalc();
      },
      preConfirm: () => {
        const qtyInput = document.getElementById('buy-qty-input');
        let qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
        if (qty < 1) qty = 1;
        if (qty > maxStock) qty = maxStock;

        const total = qty * unitPrice;
        if (userBalance < total) {
          Swal.showValidationMessage(`ยอดเงินไม่เพียงพอ ขาดอีก ${(total - userBalance).toLocaleString('th-TH')} บาท`);
          return false;
        }
        return qty;
      }
    });

    if (selectedQty) {
      const quantity = parseInt(selectedQty) || 1;
      const totalPrice = quantity * unitPrice;

      try {
        const orderRef = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // 1. Deduct Credit via Immutable Wallet Ledger Engine
        const deduction = await window.walletManager.deductWalletForPurchase({
          userId: user.id,
          username: user.username,
          amount: totalPrice,
          orderId: orderRef,
          productName: product.name,
          quantity: quantity
        });

        const newBal = deduction.balanceAfter;

        // 2. Deduct product stock in Supabase
        const newStock = Math.max(0, currentStock - quantity);
        await window.supabaseManager.updateRecord('products', product.id, { stock: newStock });

        // 3. Create Order Record in Supabase
        const deliveryKeys = [];
        for (let i = 0; i < quantity; i++) {
          if (product.delivery_data) {
            deliveryKeys.push(quantity === 1 ? product.delivery_data : `${product.delivery_data} [#${i+1}]`);
          } else {
            deliveryKeys.push(`ITEM-KEY-${Date.now()}-${Math.floor(1000 + Math.random()*9000)}`);
          }
        }
        const deliveryCodeStr = deliveryKeys.join(' | ');

        const newOrder = {
          id: orderRef,
          user_id: user.id,
          username: user.username,
          product_id: product.id,
          product_name: product.name,
          quantity: quantity,
          total_price: totalPrice,
          delivery_code: deliveryCodeStr,
          status: 'completed'
        };
        await window.supabaseManager.insertRecord('orders', newOrder);

        this.renderProducts();
        window.updateUserBalanceDisplays();
        if (window.ordersManager) window.ordersManager.loadProfileOrders();

        Swal.fire({
          icon: 'success',
          title: '🎉 สั่งซื้อสำเร็จ!',
          html: `
            <div style="text-align: left; background: #1a1b28; padding: 14px; border-radius: 12px; margin-top: 10px; border: 1px solid #2d2f45;">
              <p style="color: #a5a8bc; font-size: 0.85rem;">รหัสออเดอร์: <code style="color: #34d399;">${orderRef}</code></p>
              <p style="color: #a5a8bc; font-size: 0.85rem; margin-top: 2px;">สินค้า: <b style="color: #fff;">${product.name}</b></p>
              <p style="color: #a5a8bc; font-size: 0.85rem; margin-top: 2px;">จำนวน: <b style="color: #f472b6;">${quantity.toLocaleString('th-TH')} ชิ้น</b></p>
              <p style="color: #a5a8bc; font-size: 0.85rem; margin-top: 2px;">ยอดชำระทั้งหมด: <b style="color: #f472b6;">${totalPrice.toLocaleString('th-TH')} บาท</b></p>
              <p style="color: #a5a8bc; font-size: 0.85rem; margin-top: 2px;">ยอดคงเหลือ: <b style="color: #34d399;">${newBal.toLocaleString('th-TH')} บาท</b></p>
              <div style="margin-top: 10px;">
                <span style="font-size: 0.78rem; color: #f472b6; font-weight: 700;">ข้อมูลการจัดส่ง / รหัสไอเทม:</span>
                <div style="background: #11121c; padding: 8px 12px; border-radius: 6px; border: 1px dashed #e11d48; margin-top: 4px; font-family: monospace; color: #34d399; font-weight: 700; word-break: break-all; max-height: 120px; overflow-y: auto;">
                  ${deliveryCodeStr}
                </div>
              </div>
            </div>
          `,
          confirmButtonText: 'ปิดหน้าต่าง',
          background: '#151622',
          color: '#fff',
          confirmButtonColor: '#e11d48'
        });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'การสั่งซื้อขัดข้อง', text: err.message, background: '#151622', color: '#fff' });
      }
    }
  }
}

window.shopManager = new ShopManager();
