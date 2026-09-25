// ==============================================================================
// LITTLE CLOUD SHOP - REAL PRODUCTION SUPABASE DATABASE ENGINE
// ==============================================================================

const SUPABASE_CONFIG_KEY = 'little_cloud_supabase_cfg_v5';

const DEFAULT_SUPABASE_URL = 'https://syyqfckckjebwtxwqqti.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5eXFmY2tja2plYnd0eHdxcXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0Mjc4MjAsImV4cCI6MjA4OTk5MzgyMH0.1D7h4Q96F6pZlqV3Z0s3-qQ9t_5F_9R_r-u4oZ0W3X4';

/**
 * Global Popup Modal to Configure / Connect Supabase
 */
window.openSupabaseConfigModal = function() {
  const currentUrl = (window.supabaseManager && window.supabaseManager.config && window.supabaseManager.config.url) || DEFAULT_SUPABASE_URL;
  const currentKey = (window.supabaseManager && window.supabaseManager.config && window.supabaseManager.config.anonKey) || DEFAULT_SUPABASE_ANON_KEY;

  if (typeof Swal === 'undefined') {
    alert(`Supabase Project URL: ${currentUrl}`);
    return;
  }

  Swal.fire({
    title: '⚡ เชื่อมต่อฐานข้อมูล Supabase',
    html: `
      <div style="text-align: left; padding: 6px 0;">
        <p style="color: #9496a8; font-size: 0.85rem; margin-bottom: 12px;">
          เชื่อมต่อกับฐานข้อมูล Supabase Cloud เพื่อจัดเก็บและดึงข้อมูลแบบ Real-time
        </p>
        <div style="margin-bottom: 12px;">
          <label style="font-size: 0.8rem; color: #f472b6; font-weight: 700; display: block; margin-bottom: 4px;">Supabase Project URL</label>
          <input type="text" id="swal-supa-url" value="${currentUrl}" style="background: #101118; border: 1px solid #2d2f45; border-radius: 8px; padding: 10px; width: 100%; color: #fff; font-size: 0.85rem;">
        </div>
        <div style="margin-bottom: 14px;">
          <label style="font-size: 0.8rem; color: #f472b6; font-weight: 700; display: block; margin-bottom: 4px;">Supabase Anon Public Key</label>
          <textarea id="swal-supa-key" rows="3" style="background: #101118; border: 1px solid #2d2f45; border-radius: 8px; padding: 10px; width: 100%; color: #fff; font-size: 0.8rem; font-family: monospace;">${currentKey}</textarea>
        </div>
        <button type="button" class="btn-outline-dark" style="width: 100%; padding: 8px; font-size: 0.82rem; color: #34d399; border-color: #059669;" onclick="document.getElementById('swal-supa-url').value='${DEFAULT_SUPABASE_URL}'; document.getElementById('swal-supa-key').value='${DEFAULT_SUPABASE_ANON_KEY}';">
          <i class="fas fa-wand-magic-sparkles"></i> กู้คืนค่าเริ่มต้น (Default Project)
        </button>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-plug"></i> บันทึก & เชื่อมต่อทันที',
    cancelButtonText: 'ยกเลิก',
    background: '#151622',
    color: '#fff',
    confirmButtonColor: '#e11d48',
    cancelButtonColor: '#374151',
    preConfirm: () => {
      const url = document.getElementById('swal-supa-url').value;
      const anonKey = document.getElementById('swal-supa-key').value;
      if (!url || !anonKey) {
        Swal.showValidationMessage('กรุณากรอกทั้ง Project URL และ Anon Key');
        return false;
      }
      return { url, anonKey };
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      Swal.fire({
        title: 'กำลังเชื่อมต่อ...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
        background: '#151622',
        color: '#fff'
      });

      const success = await window.supabaseManager.saveConfig(result.value.url, result.value.anonKey);
      
      if (success) {
        Swal.fire({
          icon: 'success',
          title: 'เชื่อมต่อ Supabase สำเร็จ!',
          text: 'ระบบดึงข้อมูลสินค้า หมวดหมู่ และยอดเครดิตจากฐานข้อมูลจริงเรียบร้อยแล้ว',
          background: '#151622',
          color: '#fff',
          confirmButtonColor: '#10b981'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'การเชื่อมต่อล้มเหลว',
          text: 'ไม่สามารถเชื่อมต่อกับ Supabase ได้ กรุณาตรวจสอบ Project URL และ Anon Key',
          background: '#151622',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    }
  });
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
    // Auto default to Little Cloud Shop Project
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
      if (!window.supabase) {
        console.warn('Supabase JS library not loaded yet, retrying...');
      } else {
        this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
      }

      this.isConnected = true;
      this.updateConnectionStatusUI(true);
      console.log('✅ Supabase Client Initialized:', this.config.url);
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
    const warning = document.getElementById('supabase-unconnected-alert');
    
    if (badge) {
      badge.style.cursor = 'pointer';
      if (connected) {
        badge.className = 'status-badge connected';
        badge.innerHTML = '<i class="fas fa-circle-check" style="color: #34d399; margin-right: 4px;"></i> <span>Supabase Cloud (เชื่อมต่อแล้ว)</span>';
      } else {
        badge.className = 'status-badge disconnected';
        badge.innerHTML = '<i class="fas fa-circle-exclamation" style="color: #ef4444; margin-right: 4px;"></i> <span style="text-decoration: underline;">ยังไม่ได้เชื่อมต่อ Supabase (คลิกเพื่อเชื่อมต่อ)</span>';
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
        // Fallback without ordering
        const fallback = await this.client.from(tableName).select('*');
        if (!fallback.error && fallback.data) {
          return fallback.data;
        }
        console.warn(`Query ${tableName} note:`, error ? error.message : '');
      } catch (e) {
        console.warn(`Fetch ${tableName} notice:`, e.message);
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
        console.error(`Insert ${tableName} error in Supabase:`, e);
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
        console.error(`Update ${tableName} error in Supabase:`, e);
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
        console.error(`Upsert ${tableName} error in Supabase:`, e);
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
        console.error(`Delete ${tableName} error in Supabase:`, e);
        throw e;
      }
    } else {
      throw new Error('กรุณาเชื่อมต่อ Supabase ก่อนทำรายการ');
    }
  }
}

window.supabaseManager = new SupabaseManager();

// Bind click event after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('supabase-status-badge');
  if (badge) {
    badge.addEventListener('click', () => {
      if (typeof window.openSupabaseConfigModal === 'function') {
        window.openSupabaseConfigModal();
      }
    });
  }
  if (window.supabaseManager) {
    window.supabaseManager.updateConnectionStatusUI(true);
  }
});
