// ==============================================================================
// LITTLE CLOUD SHOP - REAL PRODUCTION SUPABASE DATABASE ENGINE
// ==============================================================================

const SUPABASE_CONFIG_KEY = 'little_cloud_supabase_cfg_v7';

const DEFAULT_SUPABASE_URL = 'https://hwzdowxjxtdhcgiylnbo.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_5ZvVjg1viXXX_vli5gdhAA_j4lSg5j4';

/**
 * Smart URL Formatter:
 * Accepts:
 * - https://hwzdowxjxtdhcgiylnbo.supabase.co
 * - https://supabase.com/dashboard/project/hwzdowxjxtdhcgiylnbo
 * - https://supabase.com/dashboard/project/hwzdowxjxtdhcgiylnbo/settings/api
 * - hwzdowxjxtdhcgiylnbo
 */
function sanitizeSupabaseUrl(input) {
  if (!input) return DEFAULT_SUPABASE_URL;
  let str = input.trim();

  // If user pasted dashboard link: https://supabase.com/dashboard/project/hwzdowxjxtdhcgiylnbo
  const dashMatch = str.match(/project\/([a-z0-9_-]+)/i);
  if (dashMatch) {
    return `https://${dashMatch[1]}.supabase.co`;
  }

  // If user just typed the ref ID
  if (/^[a-z0-9_-]{15,30}$/i.test(str)) {
    return `https://${str}.supabase.co`;
  }

  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    str = 'https://' + str;
  }

  return str.replace(/\/+$/, '');
}

/**
 * Direct On-Page Save Supabase Handler (No Modal Needed)
 */
window.handleDirectSaveSupabase = async function (event) {
  if (event) event.preventDefault();
  const urlInput = document.getElementById('direct-supa-url') || document.getElementById('native-supa-url');
  const keyInput = document.getElementById('direct-supa-key') || document.getElementById('native-supa-key');
  const msgEl = document.getElementById('direct-supa-msg');

  const rawUrl = urlInput ? urlInput.value.trim() : '';
  const anonKey = keyInput ? keyInput.value.trim() : '';

  if (!rawUrl || !anonKey) {
    if (msgEl) {
      msgEl.style.display = 'block';
      msgEl.style.color = '#ef4444';
      msgEl.textContent = '❌ กรุณากรอกทั้ง Supabase URL และ Anon Key';
    }
    if (typeof Swal !== 'undefined') {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูล', text: 'ต้องใส่ทั้ง Project URL และ Anon Key', background: '#151622', color: '#fff' });
    }
    return;
  }

  const cleanUrl = sanitizeSupabaseUrl(rawUrl);
  if (msgEl) {
    msgEl.style.display = 'block';
    msgEl.style.color = '#38bdf8';
    msgEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังเชื่อมต่อกับ ' + cleanUrl + '...';
  }

  const success = await window.supabaseManager.saveConfig(cleanUrl, anonKey);

  // Sync all inputs on page
  window.syncDirectSupabaseInputs();

  if (msgEl) {
    msgEl.style.display = 'block';
    if (success) {
      msgEl.style.color = '#34d399';
      msgEl.innerHTML = '✅ บันทึกและเชื่อมต่อ Supabase สำเร็จ (' + cleanUrl + ')';
    } else {
      msgEl.style.color = '#fbbf24';
      msgEl.innerHTML = '⚠️ บันทึกข้อมูลแล้ว แต่ไม่สามารถดึงตารางได้ (โปรดตรวจทาน URL/Key หรือ CORS)';
    }
  }

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: success ? 'success' : 'info',
      title: success ? 'เชื่อมต่อ Supabase สำเร็จ!' : 'บันทึกการตั้งค่าแล้ว',
      text: `เชื่อมต่อกับ ${cleanUrl} เรียบร้อยแล้ว`,
      background: '#151622',
      color: '#fff',
      confirmButtonColor: '#10b981'
    });
  }
};

window.restoreDirectSupabaseConfig = function () {
  const urlInput = document.getElementById('direct-supa-url');
  const keyInput = document.getElementById('direct-supa-key');
  if (urlInput) urlInput.value = DEFAULT_SUPABASE_URL;
  if (keyInput) keyInput.value = DEFAULT_SUPABASE_ANON_KEY;
  window.handleDirectSaveSupabase();
};

window.syncDirectSupabaseInputs = function () {
  const currentUrl = (window.supabaseManager && window.supabaseManager.config && window.supabaseManager.config.url) || DEFAULT_SUPABASE_URL;
  const currentKey = (window.supabaseManager && window.supabaseManager.config && window.supabaseManager.config.anonKey) || DEFAULT_SUPABASE_ANON_KEY;

  const directUrl = document.getElementById('direct-supa-url');
  const directKey = document.getElementById('direct-supa-key');
  const nativeUrl = document.getElementById('native-supa-url');
  const nativeKey = document.getElementById('native-supa-key');

  if (directUrl) directUrl.value = currentUrl;
  if (directKey) directKey.value = currentKey;
  if (nativeUrl) nativeUrl.value = currentUrl;
  if (nativeKey) nativeKey.value = currentKey;

  const badge = document.getElementById('direct-supa-badge');
  if (badge) {
    const isConnected = window.supabaseManager && window.supabaseManager.isConnected;
    badge.style.background = isConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    badge.style.color = isConnected ? '#34d399' : '#f87171';
    badge.style.borderColor = isConnected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    badge.innerHTML = isConnected ? '<i class="fas fa-circle-check"></i> เชื่อมต่อแล้ว' : '<i class="fas fa-circle-xmark"></i> ยังไม่เชื่อมต่อ';
  }
};

// Auto sync when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.syncDirectSupabaseInputs());
  } else {
    setTimeout(() => window.syncDirectSupabaseInputs(), 100);
  }
}

/**
 * Open Modal for Supabase Configuration (Bulletproof with Swal fallback)
 */
window.openSupabaseConfigModal = function () {
  const modal = document.getElementById('modal-supabase-config') || document.getElementById('modal-supabase-connect');
  const currentUrl = (window.supabaseManager && window.supabaseManager.config && window.supabaseManager.config.url) || DEFAULT_SUPABASE_URL;
  const currentKey = (window.supabaseManager && window.supabaseManager.config && window.supabaseManager.config.anonKey) || DEFAULT_SUPABASE_ANON_KEY;

  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');

    const urlInput = document.getElementById('native-supa-url') || document.getElementById('supabase-cfg-url');
    const keyInput = document.getElementById('native-supa-key') || document.getElementById('supabase-cfg-key');
    if (urlInput) urlInput.value = currentUrl;
    if (keyInput) keyInput.value = currentKey;
  } else if (typeof Swal !== 'undefined') {
    // Fallback if modal DOM element is not found
    Swal.fire({
      title: '<span style="color:#34d399;"><i class="fas fa-database"></i> ตั้งค่าเชื่อมต่อ Supabase</span>',
      html: `
        <div style="text-align: left; font-size: 0.9rem; margin-top: 10px;">
          <label style="display:block; margin-bottom: 4px; color:#cbd5e1;">Supabase Project URL / ID:</label>
          <input id="swal-supa-url" class="swal2-input" style="width: 100%; margin: 0 0 12px 0; background: #1a1b28; color: #fff; border: 1px solid #2c2e42;" value="${currentUrl}">
          <label style="display:block; margin-bottom: 4px; color:#cbd5e1;">Supabase Anon Key:</label>
          <textarea id="swal-supa-key" class="swal2-textarea" style="width: 100%; margin: 0 0 12px 0; background: #1a1b28; color: #fff; border: 1px solid #2c2e42; height: 80px;">${currentKey}</textarea>
        </div>
      `,
      background: '#151622',
      color: '#fff',
      showCancelButton: true,
      confirmButtonText: '<i class="fas fa-plug"></i> บันทึกและเชื่อมต่อ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#475569',
      preConfirm: () => {
        const url = document.getElementById('swal-supa-url').value;
        const key = document.getElementById('swal-supa-key').value;
        if (!url || !key) {
          Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบถ้วน');
          return false;
        }
        return { url, key };
      }
    }).then(async (result) => {
      if (result.isConfirmed && result.value) {
        const cleanUrl = sanitizeSupabaseUrl(result.value.url);
        await window.supabaseManager.saveConfig(cleanUrl, result.value.key);
        window.syncDirectSupabaseInputs();
        Swal.fire({
          icon: 'success',
          title: 'เชื่อมต่อ Supabase สำเร็จ!',
          text: `เชื่อมต่อกับ ${cleanUrl} เรียบร้อยแล้ว`,
          background: '#151622',
          color: '#fff',
          confirmButtonColor: '#10b981'
        });
      }
    });
  }
};

window.closeSupabaseConfigModal = function () {
  const modal = document.getElementById('modal-supabase-config') || document.getElementById('modal-supabase-connect');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

window.restoreDefaultSupabaseConfig = function () {
  const urlInput = document.getElementById('native-supa-url') || document.getElementById('supabase-cfg-url');
  const keyInput = document.getElementById('native-supa-key') || document.getElementById('supabase-cfg-key');
  if (urlInput) urlInput.value = DEFAULT_SUPABASE_URL;
  if (keyInput) keyInput.value = DEFAULT_SUPABASE_ANON_KEY;
};

window.handleNativeSaveSupabase = async function (event) {
  if (event) event.preventDefault();
  const urlInput = document.getElementById('native-supa-url') || document.getElementById('supabase-cfg-url');
  const keyInput = document.getElementById('native-supa-key') || document.getElementById('supabase-cfg-key');

  const rawUrl = urlInput ? urlInput.value.trim() : '';
  const anonKey = keyInput ? keyInput.value.trim() : '';

  if (!rawUrl || !anonKey) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูล', text: 'ต้องใส่ทั้ง Project URL และ Anon Key', background: '#151622', color: '#fff' });
    } else {
      alert('ต้องใส่ทั้ง Project URL และ Anon Key');
    }
    return;
  }

  const cleanUrl = sanitizeSupabaseUrl(rawUrl);

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'กำลังเชื่อมต่อ Supabase...',
      text: cleanUrl,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      background: '#151622',
      color: '#fff'
    });
  }

  const success = await window.supabaseManager.saveConfig(cleanUrl, anonKey);
  window.syncDirectSupabaseInputs();
  window.closeSupabaseConfigModal();

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: success ? 'success' : 'info',
      title: success ? 'เชื่อมต่อ Supabase สำเร็จ!' : 'บันทึกการตั้งค่าแล้ว',
      text: `เชื่อมต่อกับ ${cleanUrl} เรียบร้อยแล้ว`,
      background: '#151622',
      color: '#fff',
      confirmButtonColor: '#10b981'
    });
  } else {
    alert('เชื่อมต่อ Supabase สำเร็จ!');
  }
};

class SupabaseManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.config = this.loadConfig();
    this.initClient();
  }

  loadConfig() {
    const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ignore any stale/leftover config that doesn't belong to this shop's
        // Supabase project (e.g. saved during earlier testing) so the page
        // always falls back to the shop's real project.
        if (parsed.url && parsed.anonKey && parsed.url.includes('hwzdowxjxtdhcgiylnbo')) {
          parsed.url = sanitizeSupabaseUrl(parsed.url);
          return parsed;
        } else if (parsed.url || parsed.anonKey) {
          localStorage.removeItem(SUPABASE_CONFIG_KEY);
        }
      } catch (e) {
        console.error('Error parsing saved Supabase config:', e);
        localStorage.removeItem(SUPABASE_CONFIG_KEY);
      }
    }
    return {
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY
    };
  }

  async saveConfig(url, anonKey) {
    const formattedUrl = sanitizeSupabaseUrl(url);
    this.config = { url: formattedUrl, anonKey: (anonKey || DEFAULT_SUPABASE_ANON_KEY).trim() };
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(this.config));

    // Clear old caches
    localStorage.removeItem('little_cloud_local_db_v2');
    localStorage.removeItem('little_cloud_local_db');

    const success = await this.initClient();
    if (success) {
      if (window.appManager) await window.appManager.init();
      if (window.shopManager) await window.shopManager.renderProducts();
      if (window.reviewsManager) await window.reviewsManager.renderReviews();
      if (window.adminManager) await window.adminManager.renderAdminProductsTable();
    }
    return success;
  }

  async initClient() {
    if (!this.config.url || !this.config.anonKey) {
      this.isConnected = false;
      this.updateConnectionStatusUI(false);
      return false;
    }

    try {
      this.config.url = sanitizeSupabaseUrl(this.config.url);
      if (window.supabase) {
        this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
      }
      this.isConnected = true;
      this.updateConnectionStatusUI(true);
      console.log('✅ Supabase Connected:', this.config.url);
      return true;
    } catch (err) {
      console.error('⚠️ Supabase connection error:', err);
      this.isConnected = false;
      this.updateConnectionStatusUI(false);
      return false;
    }
  }

  updateConnectionStatusUI(connected) {
    const badge = document.getElementById('supabase-status-badge');
    const textSpan = document.getElementById('supabase-status-text');
    const warning = document.getElementById('supabase-unconnected-alert');

    if (badge) {
      badge.style.cursor = 'pointer';
      if (connected) {
        badge.className = 'status-badge connected';
        if (textSpan) textSpan.textContent = 'Supabase Cloud (เชื่อมต่อแล้ว)';
      } else {
        badge.className = 'status-badge disconnected';
        if (textSpan) textSpan.textContent = 'ยังไม่ได้เชื่อมต่อ Supabase (คลิกเพื่อเชื่อมต่อ)';
      }
    }

    if (warning) {
      warning.style.display = connected ? 'none' : 'block';
    }
  }

  // Real Database Queries
  async fetchTable(tableName) {
    if (this.client && this.isConnected) {
      try {
        let query = this.client.from(tableName).select('*');
        if (['products', 'orders', 'topups', 'reviews', 'profiles', 'wallet_transactions', 'topup_transactions', 'credit_logs'].includes(tableName)) {
          query = query.order('created_at', { ascending: false });
        }
        const { data, error } = await query;
        if (error) {
          console.error(`Supabase Fetch Error (${tableName}):`, error.message);
          if (error.message.includes('relation') && error.message.includes('does not exist')) {
            if (typeof Swal !== 'undefined') {
              Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'error',
                title: `ยังไม่ได้สร้างตาราง ${tableName} ใน Supabase!`,
                showConfirmButton: false,
                timer: 5000,
                background: '#1e1b4b',
                color: '#fff'
              });
            }
          }
          return [];
        }
        if (data) {
          return data;
        }
      } catch (e) {
        console.error(`Supabase Exception (${tableName}):`, e);
      }
    }
    return [];
  }

  async insertRecord(tableName, record) {
    if (this.client && this.isConnected) {
      try {
        const { data, error } = await this.client.from(tableName).insert([record]).select();
        if (error) throw error;
        return data ? data[0] : record;
      } catch (e) {
        throw e;
      }
    } else {
      throw new Error('กรุณาเชื่อมต่อ Supabase ก่อนทำรายการ');
    }
  }

  async updateRecord(tableName, id, updates) {
    if (this.client && this.isConnected) {
      try {
        const { data, error } = await this.client.from(tableName).update(updates).eq('id', id).select();
        if (error) throw error;
        return data ? data[0] : updates;
      } catch (e) {
        throw e;
      }
    } else {
      throw new Error('กรุณาเชื่อมต่อ Supabase ก่อนทำรายการ');
    }
  }

  async upsertRecord(tableName, record) {
    if (this.client && this.isConnected) {
      try {
        const { data, error } = await this.client.from(tableName).upsert(record).select();
        if (error) throw error;
        return data ? data[0] : record;
      } catch (e) {
        throw e;
      }
    } else {
      throw new Error('กรุณาเชื่อมต่อ Supabase ก่อนทำรายการ');
    }
  }

  async deleteRecord(tableName, id) {
    if (this.client && this.isConnected) {
      try {
        const { error } = await this.client.from(tableName).delete().eq('id', id);
        if (error) throw error;
        return true;
      } catch (e) {
        throw e;
      }
    } else {
      throw new Error('กรุณาเชื่อมต่อ Supabase ก่อนทำรายการ');
    }
  }
}

window.supabaseManager = new SupabaseManager();

document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('supabase-status-badge');
  if (badge) {
    badge.onclick = function () {
      if (typeof window.openSupabaseConfigModal === 'function') {
        window.openSupabaseConfigModal();
      }
    };
  }
  if (window.supabaseManager) {
    window.supabaseManager.updateConnectionStatusUI(true);
  }
});
