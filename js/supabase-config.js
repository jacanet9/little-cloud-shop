// ==============================================================================
// LITTLE CLOUD SHOP - REAL PRODUCTION SUPABASE DATABASE ENGINE
// ==============================================================================

const SUPABASE_CONFIG_KEY = 'little_cloud_supabase_cfg_v3';

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
      url: '',
      anonKey: ''
    };
  }

  async saveConfig(url, anonKey) {
    this.config = { url: url.trim(), anonKey: anonKey.trim() };
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(this.config));
    
    // Clear any old fake caches
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
        console.error('Supabase library not loaded');
        this.isConnected = false;
        this.updateConnectionStatusUI(false);
        return false;
      }

      this.client = window.supabase.createClient(this.config.url, this.config.anonKey);
      
      // Test real connection by fetching 1 row from products
      const { data, error } = await this.client.from('products').select('*').limit(1);
      
      if (error) {
        console.warn('Supabase test query warning:', error.message);
        // If table exists but empty, still connected
        if (error.code === 'PGRST116' || !error.message.includes('FetchError')) {
          this.isConnected = true;
          this.updateConnectionStatusUI(true);
          return true;
        }
        this.isConnected = false;
        this.updateConnectionStatusUI(false);
        return false;
      }

      this.isConnected = true;
      console.log('✅ Connected to Real Supabase Project:', this.config.url);
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
    const warning = document.getElementById('supabase-unconnected-alert');
    
    if (badge) {
      if (connected) {
        badge.className = 'status-badge connected';
        badge.innerHTML = '<i class="fas fa-circle-check"></i> เชื่อมต่อ Supabase สำเร็จ';
      } else {
        badge.className = 'status-badge disconnected';
        badge.innerHTML = '<i class="fas fa-circle-exclamation"></i> ยังไม่ได้เชื่อมต่อ Supabase (คลิกเพื่อเชื่อมต่อ)';
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
        if (['products', 'orders', 'topups', 'reviews', 'profiles'].includes(tableName)) {
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
        console.error(`Error fetching ${tableName} from Supabase:`, error || fallback.error);
      } catch (e) {
        console.error(`Fetch ${tableName} exception:`, e);
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
