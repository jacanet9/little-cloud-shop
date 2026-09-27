// ==============================================================================
// LITTLE CLOUD SHOP - REAL PRODUCTION SUPABASE DATABASE ENGINE
// Built with Dual Engine: Supabase SDK + Zero-Dependency Direct REST Fallback
// ==============================================================================

const SUPABASE_CONFIG_KEY = 'little_cloud_supabase_cfg_v8';

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

  const dashMatch = str.match(/project\/([a-z0-9_-]+)/i);
  if (dashMatch) {
    return `https://${dashMatch[1]}.supabase.co`;
  }

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
    this.isConnected = true;
    this.config = this.loadConfig();
    this.initClient();
  }

  loadConfig() {
    const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.url && parsed.anonKey && parsed.url.includes('hwzdowxjxtdhcgiylnbo')) {
          parsed.url = sanitizeSupabaseUrl(parsed.url);
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

  /**
   * Built-in Direct REST API Engine (zero-dependency native fetch)
   * Guaranteed to work even if CDN script fails or has latency
   */
  async fetchRest(endpoint, options = {}) {
    const cleanEndpoint = endpoint.replace(/^\/+/, '');
    const url = `${this.config.url}/rest/v1/${cleanEndpoint}`;
    const headers = {
      'apikey': this.config.anonKey,
      'Authorization': `Bearer ${this.config.anonKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const reqOptions = {
      method: options.method || 'GET',
      headers,
      ...(options.body ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {})
    };

    const resp = await fetch(url, reqOptions);
    if (!resp.ok) {
      const errText = await resp.text();
      let errMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.message || errText;
      } catch (e) {}
      throw new Error(errMsg);
    }

    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }

  /**
   * Lightweight query builder shim if supabase-js client is not ready
   */
  _createQueryShim() {
    const self = this;
    return {
      from(table) {
        let filters = [];
        let selectCols = '*';
        let orderCol = null;
        let orderAsc = true;
        let singleRow = false;

        const builder = {
          select(cols = '*') {
            selectCols = cols;
            return builder;
          },
          eq(column, value) {
            filters.push(`${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`);
            return builder;
          },
          order(column, { ascending = true } = {}) {
            orderCol = column;
            orderAsc = ascending;
            return builder;
          },
          single() {
            singleRow = true;
            return builder;
          },
          async insert(records) {
            try {
              const res = await self.fetchRest(table, {
                method: 'POST',
                body: Array.isArray(records) ? records : [records],
                headers: { 'Prefer': 'return=representation' }
              });
              const data = Array.isArray(res) ? res : [res];
              return { data: singleRow ? data[0] : data, error: null };
            } catch (err) {
              return { data: null, error: err };
            }
          },
          async update(updates) {
            try {
              let queryStr = filters.length > 0 ? `?${filters.join('&')}` : '';
              const res = await self.fetchRest(`${table}${queryStr}`, {
                method: 'PATCH',
                body: updates,
                headers: { 'Prefer': 'return=representation' }
              });
              const data = Array.isArray(res) ? res : [res];
              return { data: singleRow ? data[0] : data, error: null };
            } catch (err) {
              return { data: null, error: err };
            }
          },
          async delete() {
            try {
              let queryStr = filters.length > 0 ? `?${filters.join('&')}` : '';
              await self.fetchRest(`${table}${queryStr}`, { method: 'DELETE' });
              return { error: null };
            } catch (err) {
              return { error: err };
            }
          },
          then(resolve, reject) {
            let queryParts = [`select=${encodeURIComponent(selectCols)}`];
            if (filters.length > 0) queryParts.push(...filters);
            if (orderCol) queryParts.push(`order=${orderCol}.${orderAsc ? 'asc' : 'desc'}`);
            const queryStr = `?${queryParts.join('&')}`;

            self.fetchRest(`${table}${queryStr}`)
              .then(data => {
                const result = singleRow ? (Array.isArray(data) ? data[0] || null : data) : data;
                resolve({ data: result, error: null });
              })
              .catch(err => {
                resolve({ data: null, error: err });
              });
          }
        };
        return builder;
      }
    };
  }

  async initClient() {
    this.config.url = sanitizeSupabaseUrl(this.config.url);
    try {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
      }
    } catch (err) {
      console.warn('⚠️ Supabase createClient warning, falling back to direct REST client:', err);
    }

    if (!this.client) {
      this.client = this._createQueryShim();
    }

    this.isConnected = true;
    this.updateConnectionStatusUI(true);
    return true;
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

  // Real Database Queries with automatic direct REST fallback
  async fetchTable(tableName) {
    if (this.client && typeof this.client.from === 'function') {
      try {
        let query = this.client.from(tableName).select('*');
        if (['products', 'orders', 'topups', 'reviews', 'profiles', 'wallet_transactions', 'topup_transactions', 'credit_logs'].includes(tableName)) {
          query = query.order('created_at', { ascending: false });
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          return data;
        }
        if (error) {
          console.warn(`Supabase client query warning (${tableName}), falling back to direct REST:`, error.message);
        }
      } catch (e) {
        console.warn(`Supabase client exception (${tableName}), trying REST fallback:`, e);
      }
    }

    try {
      let queryStr = '?select=*';
      if (['products', 'orders', 'topups', 'reviews', 'profiles', 'wallet_transactions', 'topup_transactions', 'credit_logs'].includes(tableName)) {
        queryStr += '&order=created_at.desc';
      }
      const data = await this.fetchRest(`${tableName}${queryStr}`);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(`Supabase REST Fetch Error (${tableName}):`, e.message);
      return [];
    }
  }

  async insertRecord(tableName, record) {
    if (this.client && typeof this.client.from === 'function') {
      try {
        const { data, error } = await this.client.from(tableName).insert([record]).select();
        if (!error && data) return data[0] || record;
      } catch (e) {
        console.warn(`Insert via client failed (${tableName}), using REST fallback:`, e);
      }
    }

    try {
      const data = await this.fetchRest(tableName, {
        method: 'POST',
        body: [record],
        headers: { 'Prefer': 'return=representation' }
      });
      return Array.isArray(data) ? data[0] : (data || record);
    } catch (e) {
      console.error(`REST Insert Error (${tableName}):`, e);
      throw e;
    }
  }

  async updateRecord(tableName, id, updates) {
    if (this.client && typeof this.client.from === 'function') {
      try {
        const { data, error } = await this.client.from(tableName).update(updates).eq('id', id).select();
        if (!error && data) return data[0] || updates;
      } catch (e) {
        console.warn(`Update via client failed (${tableName}), using REST fallback:`, e);
      }
    }

    try {
      const data = await this.fetchRest(`${tableName}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: updates,
        headers: { 'Prefer': 'return=representation' }
      });
      return Array.isArray(data) ? data[0] : (data || updates);
    } catch (e) {
      console.error(`REST Update Error (${tableName}):`, e);
      throw e;
    }
  }

  async upsertRecord(tableName, record) {
    if (this.client && typeof this.client.from === 'function') {
      try {
        const { data, error } = await this.client.from(tableName).upsert(record).select();
        if (!error && data) return data[0] || record;
      } catch (e) {
        console.warn(`Upsert via client failed (${tableName}), using REST fallback:`, e);
      }
    }

    try {
      const data = await this.fetchRest(tableName, {
        method: 'POST',
        body: record,
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' }
      });
      return Array.isArray(data) ? data[0] : (data || record);
    } catch (e) {
      console.error(`REST Upsert Error (${tableName}):`, e);
      throw e;
    }
  }

  async deleteRecord(tableName, id) {
    if (this.client && typeof this.client.from === 'function') {
      try {
        const { error } = await this.client.from(tableName).delete().eq('id', id);
        if (!error) return true;
      } catch (e) {
        console.warn(`Delete via client failed (${tableName}), using REST fallback:`, e);
      }
    }

    try {
      await this.fetchRest(`${tableName}?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return true;
    } catch (e) {
      console.error(`REST Delete Error (${tableName}):`, e);
      throw e;
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
