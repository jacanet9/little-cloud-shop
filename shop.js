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

  parseProductMedia(p) {
    const desc = p.description || '';
    const videoMatch = desc.match(/\[(?:VIDEO|GIF):([^\]]+)\]/i);
    const videoUrl = videoMatch ? videoMatch[1].trim() : (p.video_url || '');
    const cleanDesc = desc.replace(/\[(?:VIDEO|GIF):([^\]]+)\]/gi, '').trim();

    let mediaType = 'image';
    if (videoUrl) {
      if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        mediaType = 'youtube';
      } else if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(videoUrl) || videoUrl.startsWith('data:video') || videoUrl.includes('/videos/')) {
        mediaType = 'video';
      } else if (/\.(gif)(\?.*)?$/i.test(videoUrl) || videoUrl.includes('tenor.com') || videoUrl.includes('giphy.com')) {
        mediaType = 'gif';
      } else {
        mediaType = (videoUrl.endsWith('.jpg') || videoUrl.endsWith('.png') || videoUrl.endsWith('.webp')) ? 'image' : 'video';
      }
    }
    return { videoUrl, cleanDesc, mediaType };
  }

  renderMediaHTML(p, options = {}) {
    const { videoUrl, cleanDesc, mediaType } = this.parseProductMedia(p);
    const maxHeight = options.maxHeight || 280;
    const isAutoplay = options.isAutoplay !== false;
    const fallbackImg = p.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80';

    if (mediaType === 'youtube' && videoUrl) {
      let ytId = '';
      const m1 = videoUrl.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*)/);
      if (m1 && m1[1] && m1[1].length === 11) ytId = m1[1];
      const shortsM = videoUrl.match(/shorts\/([^#&?]*)/);
      if (shortsM && shortsM[1]) ytId = shortsM[1];

      if (ytId) {
        return `
          <div style="position: relative; width: 100%; height: ${maxHeight}px; background: #000; border-radius: 12px; overflow: hidden; border: 1px solid #2d2f48;">
            <iframe src="https://www.youtube.com/embed/${ytId}?autoplay=${isAutoplay ? 1 : 0}&mute=0&loop=1&playlist=${ytId}&modestbranding=1&rel=0" 
              style="width: 100%; height: 100%; border: none;" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen>
            </iframe>
          </div>
        `;
      }
    }

    if (mediaType === 'video' && videoUrl) {
      return `
        <div style="position: relative; width: 100%; background: #080910; border-radius: 12px; overflow: hidden; border: 1px solid #2d2f48; display: flex; align-items: center; justify-content: center;">
          <video src="${videoUrl}" ${isAutoplay ? 'autoplay' : ''} loop muted playsinline controls 
            style="width: 100%; max-height: ${maxHeight}px; object-fit: contain; background: #000; display: block;"
            onerror="this.onerror=null; this.parentElement.innerHTML='<img src=\\'${fallbackImg}\\' style=\\'width:100%; max-height:${maxHeight}px; object-fit:contain; border-radius:12px;\\'>';">
          </video>
        </div>
      `;
    }

    if ((mediaType === 'gif' || mediaType === 'image') && videoUrl) {
      return `
        <div style="position: relative; width: 100%; background: #080910; border-radius: 12px; overflow: hidden; border: 1px solid #2d2f48; display: flex; align-items: center; justify-content: center;">
          <img src="${videoUrl}" alt="${p.name}" 
            style="width: 100%; max-height: ${maxHeight}px; object-fit: contain; display: block;"
            onerror="this.onerror=null; this.src='${fallbackImg}';">
          <div style="position: absolute; top: 10px; right: 10px; background: rgba(225, 29, 72, 0.9); color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; gap: 4px; backdrop-filter: blur(4px); box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
            <i class="fas fa-play"></i> GIF แอนิเมชัน
          </div>
        </div>
      `;
    }

    // Default: Fallback Product Image
    return `
      <div style="position: relative; width: 100%; background: #080910; border-radius: 12px; overflow: hidden; border: 1px solid #2d2f48; display: flex; align-items: center; justify-content: center;">
        <img src="${fallbackImg}" alt="${p.name}" 
          style="width: 100%; max-height: ${maxHeight}px; object-fit: contain; display: block;"
          onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'">
      </div>
    `;
  }

  renderProductCard(p) {
    const price = Number(p.price) || 0;
    const stockText = p.stock > 100 ? '👁️ ไม่จำกัด' : `📦 คงเหลือ ${p.stock} ชิ้น`;
    const isOutOfStock = p.stock <= 0;
    const { videoUrl, mediaType, cleanDesc } = this.parseProductMedia(p);
    const hasMedia = !!videoUrl;
    const isSkinWeapon = (
      p.category === 'สกินอาวุธ' || 
      p.category === 'Skin Weapon' || 
      (p.name && p.name.includes('สกิน')) ||
      hasMedia
    );

    const clickAction = isSkinWeapon 
      ? `window.shopManager.openSkinDetailModal('${p.id}')`
      : `window.shopManager.handleDirectBuy('${p.id}')`;

    const buttonTitle = isSkinWeapon ? "ดูรายละเอียดและวิดีโอตัวอย่างสกิน" : "สั่งซื้อทันที";

    return `
      <div class="jelly-product-card" data-id="${p.id}" ${isSkinWeapon ? `style="cursor: pointer;" onclick="if(!event.target.closest('button')) window.shopManager.openSkinDetailModal('${p.id}')"` : ''}>
        <!-- Card Image (Image 3) -->
        <div class="jelly-card-media" style="position: relative;">
          <img src="${p.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'}" alt="${p.name}" class="jelly-card-img" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'">
          <span class="jelly-stock-badge">${stockText}</span>
          ${isSkinWeapon ? `
            <span style="position: absolute; top: 10px; right: 10px; background: rgba(225, 29, 72, 0.9); color: #fff; padding: 3px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; backdrop-filter: blur(4px); box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
              <i class="fas ${hasMedia ? 'fa-circle-play' : 'fa-crosshairs'}" style="font-size: 0.68rem; color: #fff;"></i> ${hasMedia ? 'วิดีโอตัวอย่าง' : 'ดูสกิน'}
            </span>
          ` : ''}
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

            <!-- Plus Button: Shows Details & Video for Skin Weapon, or Direct Buy for Others -->
            <button class="btn-card-add" onclick="${clickAction}" title="${buttonTitle}" ${isOutOfStock ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
              <i class="fas fa-plus"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async renderProducts() {
    const grid = document.getElementById('jelly-products-grid');
    const homeGrid = document.getElementById('home-featured-grid');

    if (grid) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <i class="fas fa-spinner fa-spin" style="font-size: 1.8rem; color: #f472b6; margin-bottom: 8px;"></i>
          <p>กำลังดึงข้อมูลสินค้าจาก Supabase...</p>
        </div>
      `;
    }

    if (homeGrid) {
      homeGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <i class="fas fa-spinner fa-spin" style="font-size: 1.8rem; color: #f472b6; margin-bottom: 8px;"></i>
          <p>กำลังดึงข้อมูลสินค้าจาก Supabase...</p>
        </div>
      `;
    }

    let products = await this.getProducts();

    // Render Home Featured Grid
    if (homeGrid) {
      if (products.length > 0) {
        homeGrid.innerHTML = products.slice(0, 8).map(p => this.renderProductCard(p)).join('');
      } else {
        homeGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-dim);">
            <i class="fas fa-box-open" style="font-size: 2.5rem; margin-bottom: 10px; display: block;"></i>
            <p>ยังไม่มีรายการสินค้าในระบบ</p>
          </div>
        `;
      }
    }

    if (!grid) return;

    // Filter by category for shop page
    let filtered = products.filter(p => {
      let matchCat = false;
      if (this.currentCategory === 'all') matchCat = true;
      else if (this.currentCategory === 'discount') matchCat = p.original_price && p.original_price > p.price;
      else if (this.currentCategory === 'Skin Weapon') matchCat = p.category === 'สกินอาวุธ' || p.category === 'Skin Weapon';
      else matchCat = p.category === this.currentCategory;

      const matchSearch = !this.searchQuery ||
        (p.name && p.name.toLowerCase().includes(this.searchQuery)) ||
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
      if (this.currentCategory === 'all' && !this.searchQuery) {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-dim); background: #151620; border: 1px solid #2d3045; border-radius: 20px;">
            <i class="fas fa-database" style="font-size: 2.5rem; color: #34d399; margin-bottom: 15px; display: block;"></i>
            <h3 style="color: #fff; margin-bottom: 8px;">เชื่อมต่อ Supabase สำเร็จ! แต่ยังไม่มีสินค้า</h3>
            <p style="margin-bottom: 12px;">ในตาราง <code>products</code> ของคุณยังไม่มีข้อมูล หรือถูกปิดกั้นด้วย RLS (Row Level Security)</p>
            <p style="font-size: 0.85rem; color: #f472b6; font-weight: bold;">👉 วิธีแก้: เข้าสู่ระบบ (แอดมิน) -> ไปที่หน้าโปรไฟล์ -> แผงควบคุมแอดมิน -> กด 'เพิ่มสินค้าใหม่'</p>
          </div>
        `;
      } else {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-dim);">
            <i class="fas fa-box-open" style="font-size: 2.5rem; margin-bottom: 10px; display: block;"></i>
            <p>ไม่พบรายการสินค้าในหมวดหมู่นี้</p>
          </div>
        `;
      }
      return;
    }

    grid.innerHTML = filtered.map(p => this.renderProductCard(p)).join('');
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
    const { videoUrl, cleanDesc, mediaType } = this.parseProductMedia(product);
    const hasMedia = !!videoUrl;
    const isSkinWeapon = (
      product.category === 'สกินอาวุธ' || 
      product.category === 'Skin Weapon' || 
      (product.name && product.name.includes('สกิน')) ||
      hasMedia
    );

    const { value: selectedQty } = await Swal.fire({
      title: 'เลือกจำนวนสินค้าที่ต้องการสั่งซื้อ',
      html: `
        <div class="buy-modal-wrapper" style="text-align: left; padding: 4px 0;">
          <!-- Product Summary Box -->
          <div style="display: flex; gap: 14px; align-items: center; background: #1a1b28; padding: 12px 14px; border-radius: 12px; border: 1px solid #292b3d; margin-bottom: 14px;">
            <img src="${product.image_url || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'}" style="width: 56px; height: 56px; object-fit: cover; border-radius: 10px; border: 1px solid #3c1e6d;" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80'">
            <div style="flex: 1; min-width: 0;">
              <h4 style="color: #fff; font-size: 1.05rem; font-weight: 700; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${product.name}</h4>
              <div style="display: flex; gap: 10px; align-items: center; font-size: 0.82rem;">
                <span style="color: #f472b6; font-weight: 700;">${unitPrice.toLocaleString('th-TH')} บาท/ชิ้น</span>
                <span style="color: #9496a8; background: #252738; padding: 2px 8px; border-radius: 4px;">📦 คงเหลือ ${currentStock} ชิ้น</span>
              </div>
            </div>
          </div>

          <!-- Video / Animation Showcase for Skin Weapons or Products with Media -->
          ${(isSkinWeapon || hasMedia) ? `
          <div style="background: #0d0e17; border: 1px solid #2d2f48; border-radius: 14px; padding: 10px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #f472b6; font-size: 0.82rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                <i class="fas fa-play-circle"></i> วิดีโอ / ตัวอย่างแอนิเมชันในเกม
              </span>
              <button type="button" onclick="Swal.close(); window.shopManager.openSkinDetailModal('${product.id}')" 
                style="background: rgba(244,114,182,0.15); border: 1px solid rgba(244,114,182,0.35); color: #f472b6; font-size: 0.72rem; padding: 3px 9px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-weight: 600;">
                <i class="fas fa-expand"></i> ดูรายละเอียดเต็ม
              </button>
            </div>
            ${this.renderMediaHTML(product, { maxHeight: 220, isAutoplay: true })}
            ${cleanDesc ? `<div style="margin-top: 8px; font-size: 0.8rem; color: #cbd5e1; background: #131422; padding: 8px 12px; border-radius: 8px; border: 1px solid #23253a; line-height: 1.4;"><i class="fas fa-circle-info" style="color: #38bdf8;"></i> ${cleanDesc}</div>` : ''}
          </div>
          ` : ''}

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
      willClose: () => {
        const vid = document.querySelector('.buy-modal-wrapper video');
        if (vid) vid.pause();
      },
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
        const deliveryCodeStr = product.delivery_data || 'นัดรับของในเกม FiveM';

        const newOrder = {
          user_id: user.id,
          username: user.username,
          product_id: product.id,
          product_name: product.name,
          quantity: quantity,
          total_price: totalPrice,
          delivery_code: deliveryCodeStr,
          status: 'completed'
        };
        const createdOrder = await window.supabaseManager.insertRecord('orders', newOrder);
        const displayOrderId = (createdOrder && createdOrder.id) ? createdOrder.id : orderRef;

        this.renderProducts();
        window.updateUserBalanceDisplays();
        if (window.ordersManager) window.ordersManager.loadProfileOrders();

        // Automatically open live customer chat with admin immediately upon purchase
        if (window.chatManager) {
          window.chatManager.openChatForOrder(displayOrderId, product.name);
        }

        Swal.fire({
          icon: 'success',
          title: '🎉 สั่งซื้อสำเร็จ!',
          html: `
            <div style="text-align: left; background: #1a1b28; padding: 14px; border-radius: 12px; margin-top: 10px; border: 1px solid #2d2f45;">
              <p style="color: #a5a8bc; font-size: 0.85rem;">รหัสออเดอร์: <code style="color: #34d399;">${displayOrderId}</code></p>
              <p style="color: #a5a8bc; font-size: 0.85rem; margin-top: 2px;">สินค้า: <b style="color: #fff;">${product.name}</b></p>
              <p style="color: #a5a8bc; font-size: 0.85rem; margin-top: 2px;">จำนวน: <b style="color: #f472b6;">${quantity.toLocaleString('th-TH')} ชิ้น</b></p>
              <p style="color: #a5a8bc; font-size: 0.85rem; margin-top: 2px;">ยอดชำระทั้งหมด: <b style="color: #f472b6;">${totalPrice.toLocaleString('th-TH')} บาท</b></p>
              <p style="color: #a5a8bc; font-size: 0.85rem; margin-top: 2px;">ยอดคงเหลือ: <b style="color: #34d399;">${newBal.toLocaleString('th-TH')} บาท</b></p>
              <p style="color: #a5a8bc; font-size: 0.85rem; margin-top: 4px;">การจัดส่ง: <b style="color: #34d399;"><i class="fas fa-car"></i> นัดรับของในเกม FiveM ผ่านแชท</b></p>
              <div style="margin-top: 14px;">
                <button type="button" class="btn-pink" style="width: 100%; padding: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.92rem;" onclick="window.chatManager && window.chatManager.openChatForOrder('${displayOrderId}', '${product.name.replace(/'/g, "\\'")}'); Swal.close();">
                  <i class="fas fa-comments"></i> เปิดหน้าต่างแชทกับแอดมินทันที
                </button>
              </div>
            </div>
          `,
          confirmButtonText: 'ตกลง',
          background: '#151622',
          color: '#fff',
          confirmButtonColor: '#2b2d42'
        });
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'การสั่งซื้อขัดข้อง', text: err.message, background: '#151622', color: '#fff' });
      }
    }
  }

  async openSkinDetailModal(productId) {
    const products = await this.getProducts();
    const p = products.find(item => String(item.id) === String(productId));
    if (!p) return;

    const modal = document.getElementById('modal-skin-detail');
    if (!modal) return;

    const titleEl = document.getElementById('skin-modal-title');
    const badgeEl = document.getElementById('skin-modal-badge');
    const serverEl = document.getElementById('skin-modal-server');
    const priceEl = document.getElementById('skin-modal-price');
    const origPriceEl = document.getElementById('skin-modal-orig-price');
    const descEl = document.getElementById('skin-modal-desc');
    const stockEl = document.getElementById('skin-modal-stock');
    const mediaContainer = document.getElementById('skin-modal-media-container');
    const mediaStatusEl = document.getElementById('skin-modal-media-status');
    const buyBtn = document.getElementById('skin-modal-buy-btn');
    const chatBtn = document.getElementById('skin-modal-chat-btn');

    const { videoUrl, cleanDesc, mediaType } = this.parseProductMedia(p);
    const numPrice = Number(p.price) || 0;
    const numOrig = Number(p.original_price);

    if (titleEl) titleEl.textContent = p.name;
    if (badgeEl) {
      if (p.badge_text) {
        badgeEl.textContent = p.badge_text;
        badgeEl.style.display = 'inline-block';
      } else if (numOrig && numOrig > numPrice) {
        badgeEl.textContent = `-${(numOrig - numPrice).toFixed(0)}฿`;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }
    if (serverEl) serverEl.textContent = p.server_tag || 'FiveM Weapon Skin';
    if (priceEl) priceEl.textContent = `${numPrice.toLocaleString('th-TH')} ฿`;
    if (origPriceEl) {
      if (numOrig && numOrig > numPrice) {
        origPriceEl.textContent = `${numOrig.toLocaleString('th-TH')} ฿`;
        origPriceEl.style.display = 'inline';
      } else {
        origPriceEl.style.display = 'none';
      }
    }
    if (descEl) descEl.textContent = cleanDesc || 'สกินอาวุธ FiveM ระดับพรีเมียม สวยเด่นคมชัดทุกมุมมอง พร้อมส่งมอบในเกม';
    if (stockEl) stockEl.textContent = p.stock > 0 ? `📦 คงเหลือ ${p.stock} ชิ้น` : '❌ สินค้าหมดชั่วคราว';

    // Build Dynamic Media Content
    if (mediaContainer) {
      mediaContainer.innerHTML = this.renderMediaHTML(p, { maxHeight: 380, isAutoplay: true });
    }

    if (mediaStatusEl) {
      if (mediaType === 'youtube') {
        mediaStatusEl.innerHTML = '<i class="fab fa-youtube" style="color: #ef4444;"></i> กำลังเล่นคลิปตัวอย่างจาก YouTube';
      } else if (mediaType === 'video') {
        mediaStatusEl.innerHTML = '<i class="fas fa-circle-play" style="color: #f472b6;"></i> วิดีโอตัวอย่างแอนิเมชันสกินในเกม';
      } else if (mediaType === 'gif') {
        mediaStatusEl.innerHTML = '<i class="fas fa-film" style="color: #a855f7;"></i> แอนิเมชันภาพเคลื่อนไหว (GIF)';
      } else {
        mediaStatusEl.innerHTML = '<i class="fas fa-image" style="color: #38bdf8;"></i> ภาพพรีวิวสกินอาวุธ';
      }
    }

    // Connect Purchase & Chat
    if (buyBtn) {
      buyBtn.onclick = () => {
        this.closeSkinDetailModal();
        this.handleDirectBuy(p.id);
      };
      if (p.stock <= 0) {
        buyBtn.disabled = true;
        buyBtn.style.opacity = '0.5';
        buyBtn.innerHTML = '<i class="fas fa-ban"></i> สินค้าหมดชั่วคราว';
      } else {
        buyBtn.disabled = false;
        buyBtn.style.opacity = '1';
        buyBtn.innerHTML = '<i class="fas fa-cart-shopping"></i> สั่งซื้อสกินนี้ทันที';
      }
    }

    if (chatBtn) {
      chatBtn.onclick = () => {
        this.closeSkinDetailModal();
        if (window.chatManager) {
          window.chatManager.openChatForOrder(null, p.name);
        }
      };
    }

    modal.classList.add('active');
  }

  closeSkinDetailModal() {
    const modal = document.getElementById('modal-skin-detail');
    if (modal) {
      modal.classList.remove('active');
      // Clear media to stop audio/video/iframe
      const mediaContainer = document.getElementById('skin-modal-media-container');
      if (mediaContainer) {
        const vid = mediaContainer.querySelector('video');
        if (vid) vid.pause();
        const iframe = mediaContainer.querySelector('iframe');
        if (iframe) iframe.src = '';
        mediaContainer.innerHTML = '';
      }
    }
  }
}

window.shopManager = new ShopManager();
window.openSkinDetailModal = (id) => window.shopManager && window.shopManager.openSkinDetailModal(id);
window.closeSkinDetailModal = () => window.shopManager && window.shopManager.closeSkinDetailModal();
