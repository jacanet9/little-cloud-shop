// ==============================================================================
// LITTLE CLOUD / JELLY TOWN - MAIN NAVIGATION & APP CONTROLLER
// ==============================================================================

class AppManager {
  constructor() {
    this.currentTab = 'home';
    this.init();
  }

  async init() {
    if (window.supabaseManager) {
      await window.supabaseManager.initClient();
    }

    await this.loadSiteSettings();

    // Render initial views
    if (window.shopManager) await window.shopManager.renderProducts();
    window.updateUserBalanceDisplays();

    this.bindGlobalEvents();
  }

  async loadSiteSettings() {
    const settings = await window.supabaseManager.fetchTable('site_settings');
    const s = Array.isArray(settings) ? (settings[0] || {}) : settings;
    if (s && Object.keys(s).length > 0) {
      this.applySiteSettings(s);
    }
  }

  applySiteSettings(s) {
    if (!s) return;
    document.querySelectorAll('.brand-shop-name').forEach(el => el.textContent = s.shop_name || 'Little Cloud');
    if (s.announcement) {
      const ann = document.getElementById('site-announcement-text');
      if (ann) ann.textContent = s.announcement;
    }
    if (s.hero_title) {
      const ht = document.getElementById('hero-headline-title');
      if (ht) ht.innerHTML = s.hero_title;
    }
    if (s.hero_subtitle) {
      const hs = document.getElementById('hero-subtext-desc');
      if (hs) hs.textContent = s.hero_subtitle;
    }
    if (s.contact_discord) {
      const disc = document.getElementById('hero-discord-link');
      if (disc) disc.href = s.contact_discord;
    }
  }

  async updateLiveStats() {
    // Safely sync balance and profile states
    if (window.updateUserBalanceDisplays) window.updateUserBalanceDisplays();
  }

  bindGlobalEvents() {
    // Close Modals on Overlay Click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
  }
}

// Global Tab Switcher (Images 1, 3, 4, 5)
window.navToTab = function(tabName) {
  // Hide all views
  document.querySelectorAll('.page-view-section').forEach(view => {
    view.style.display = 'none';
  });

  // Remove active from all nav items
  document.querySelectorAll('.nav-item-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show target view
  const targetView = document.getElementById(`view-${tabName}`);
  if (targetView) targetView.style.display = 'block';

  // Highlight target nav item
  const targetNavBtn = document.getElementById(`nav-tab-${tabName}`);
  if (targetNavBtn) targetNavBtn.classList.add('active');

  // Trigger sub-renders if needed
  if (tabName === 'shop' && window.shopManager) {
    window.shopManager.renderProducts();
  } else if (tabName === 'profile') {
    window.updateUserBalanceDisplays();
    if (window.ordersManager) window.ordersManager.loadProfileOrders();
  } else if (tabName === 'topup') {
    window.updateUserBalanceDisplays();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Global Balance and User Profile Updater
window.updateUserBalanceDisplays = function() {
  const user = window.authManager ? window.authManager.currentUser : null;
  const balance = user ? Number(user.balance) || 0 : 0;
  const formatted = balance.toLocaleString('th-TH') + ' บาท';

  // 1. Navbar Balance
  const navBal = document.getElementById('nav-user-balance-val');
  if (navBal) navBal.textContent = formatted;

  // 2. Top-Up Page Balance
  const topupBal = document.getElementById('topup-current-balance-text');
  if (topupBal) topupBal.textContent = formatted;

  // 3. Profile Page Balance
  const profileBal = document.getElementById('profile-wallet-balance');
  if (profileBal) profileBal.textContent = formatted;

  // 4. Profile Card Details
  if (user) {
    const pUsername = document.getElementById('profile-card-username');
    if (pUsername) pUsername.textContent = user.username;

    const pUserId = document.getElementById('profile-card-userid');
    if (pUserId) pUserId.textContent = user.id || 'USER-8830192';

    const navAuthBtn = document.getElementById('nav-auth-btn');
    if (navAuthBtn) navAuthBtn.style.display = 'none';

    const adminBtn = document.getElementById('nav-admin-btn');
    if (adminBtn) adminBtn.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
  } else {
    const navAuthBtn = document.getElementById('nav-auth-btn');
    if (navAuthBtn) navAuthBtn.style.display = 'inline-flex';

    const adminBtn = document.getElementById('nav-admin-btn');
    if (adminBtn) adminBtn.style.display = 'none';
  }
};

window.refreshUserData = async function() {
  const user = window.authManager ? window.authManager.currentUser : null;
  if (!user) return;

  try {
    const profiles = await window.supabaseManager.fetchTable('profiles');
    const fresh = profiles.find(p => p.id === user.id || p.username.toLowerCase() === user.username.toLowerCase());
    if (fresh) {
      user.balance = Number(fresh.balance) || 0;
      user.role = fresh.role;
      window.authManager.saveCurrentUser(user);
      window.updateUserBalanceDisplays();
      Swal.fire({ icon: 'success', title: 'อัปเดตยอดเงินแล้ว', timer: 1000, showConfirmButton: false });
    }
  } catch (e) {
    console.error('Refresh user error:', e);
  }
};

window.openCartDrawer = function() {
  window.navToTab('shop');
};

document.addEventListener('DOMContentLoaded', () => {
  window.appManager = new AppManager();
});
