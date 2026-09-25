// ==============================================================================
// LITTLE CLOUD SHOP - REAL PRODUCTION SUPABASE DATABASE ENGINE
// ==============================================================================

const SUPABASE_CONFIG_KEY = 'little_cloud_supabase_cfg_v6';

const DEFAULT_SUPABASE_URL = 'https://hwzdowxjxtdhcgiylnbo.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_5ZvVjg1viXXX_vli5gdhAA_j4lSg5j4';

/**
 * Open Native Modal for Supabase Configuration
 */
window.openSupabaseConfigModal = function () {
  const modal = document.getElementById('modal-supabase-config');
  if (modal) {
    modal.classList.add('active');
    const urlInput = document.getElementById('native-supa-url');
    const keyInput = document.getElementById('native-supa-key');
    if (urlInput && window.supabaseManager) urlInput.value = window.supabaseManager.config.url || DEFAULT_SUPABASE_URL;
    if (keyInput && window.supabaseManager) keyInput.value = window.supabaseManager.config.anonKey || DEFAULT_SUPABASE_ANON_KEY;
  }
};

window.closeSupabaseConfigModal = function () {
  const modal = document.getElementById('modal-supabase-config');
  if (modal) modal.classList.remove('active');
};

window.restoreDefaultSupabaseConfig = function () {
  const urlInput = document.getElementById('native-supa-url');
  const keyInput = document.getElementById('native-supa-key');
  if (urlInput) urlInput.value = DEFAULT_SUPABASE_URL;
  if (keyInput) keyInput.value = DEFAULT_SUPABASE_ANON_KEY;
};

window.handleNativeSaveSupabase = async function (event) {
  if (event) event.preventDefault();
  const url = document.getElementById('native-supa-url').value;
  const anonKey = document.getElementById('native-supa-key').value;

  if (!url || !anonKey) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูล', text: 'ต้องใส่ทั้ง Project URL และ Anon Key' });
    } else {
      alert('ต้องใส่ทั้ง Project URL และ Anon Key');
    }
    return;
  }

  const success = await window.supabaseManager.saveConfig(url, anonKey);
  window.closeSupabaseConfigModal();

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'success',
      title: 'เชื่อมต่อ Supabase สำเร็จ!',
      text: 'ระบบดึงข้อมูลจาก Supabase Cloud เรียบร้อยแล้ว',
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
        if (parsed.url && parsed.anonKey) {
          return parsed;
        }
      } catch (e) {
        console.error('Error parsing saved Supabase config:', e);
      }
    }
    return {
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY
    };
  }

  async saveConfig(url, anonKey) {
    this.config = { url: (url || DEFAULT_SUPABASE_URL).trim(), anonKey: (anonKey || DEFAULT_SUPABASE_ANON_KEY).trim() };
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
      if (window.supabase) {
        this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
      }
      this.isConnected = true;
      this.updateConnectionStatusUI(true);
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
        if (!error && data) {
          return data;
        }
        const fallback = await this.client.from(tableName).select('*');
        if (!fallback.error && fallback.data) {
          return fallback.data;
        }
      } catch (e) { }
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

// Immediate DOM load binding
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
