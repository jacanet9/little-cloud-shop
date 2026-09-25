// ==============================================================================
// LITTLE CLOUD SHOP - REAL AUTHENTICATION & ROLE ENGINE (Direct Supabase)
// ==============================================================================

const CURRENT_USER_KEY = 'little_cloud_current_user_prod_v1';

class AuthManager {
  constructor() {
    this.currentUser = this.loadCurrentUser();
    this.bindEvents();
    this.updateUserUI();
  }

  loadCurrentUser() {
    const saved = localStorage.getItem(CURRENT_USER_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse current user session:', e);
      }
    }
    return null;
  }

  saveCurrentUser(user) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
    this.updateUserUI();
    if (window.updateUserBalanceDisplays) window.updateUserBalanceDisplays();
    if (window.shopManager && typeof window.shopManager.renderProducts === 'function') window.shopManager.renderProducts();
    if (window.appManager && typeof window.appManager.updateLiveStats === 'function') window.appManager.updateLiveStats();
  }

  bindEvents() {
    // Auth Tab Switchers (Image 1: เข้าสู่ระบบ / สมัครสมาชิก)
    const tabLogin = document.getElementById('tab-btn-login');
    const tabRegister = document.getElementById('tab-btn-register');
    const formLogin = document.getElementById('auth-form-login');
    const formRegister = document.getElementById('auth-form-register');
    const authTitle = document.getElementById('auth-modal-title');
    const authSub = document.getElementById('auth-modal-sub');

    if (tabLogin && tabRegister) {
      tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.style.display = 'block';
        formRegister.style.display = 'none';
        if (authTitle) authTitle.textContent = 'เข้าสู่ระบบ';
        if (authSub) authSub.textContent = 'Sign In';
      });

      tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        formLogin.style.display = 'none';
        formRegister.style.display = 'block';
        if (authTitle) authTitle.textContent = 'สมัครสมาชิก';
        if (authSub) authSub.textContent = 'Register';
      });
    }

    // Password Visibility Eye Toggles
    document.querySelectorAll('.toggle-password-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input) {
          if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
          } else {
            input.type = 'password';
            btn.innerHTML = '<i class="fas fa-eye"></i>';
          }
        }
      });
    });

    // Random Username Dice Generator
    const diceBtn = document.getElementById('btn-random-username');
    if (diceBtn) {
      diceBtn.addEventListener('click', () => {
        const adjectives = ['Cloud', 'Cyber', 'Neon', 'Shadow', 'Dark', 'Hyper', 'Swift', 'Ghost', 'Viper', 'Frost'];
        const nouns = ['Gamer', 'Knight', 'Slayer', 'King', 'Pilot', 'Rider', 'Phantom', 'Wolf', 'Hero', 'Blade'];
        const randomNum = Math.floor(100 + Math.random() * 900);
        const randomName = adjectives[Math.floor(Math.random() * adjectives.length)] +
                           nouns[Math.floor(Math.random() * nouns.length)] + '_' + randomNum;
        const regUserInput = document.getElementById('reg-username');
        if (regUserInput) regUserInput.value = randomName;
      });
    }

    // Password Strength Meter (Image 1: ความปลอดภัยของรหัสผ่าน)
    const regPassInput = document.getElementById('reg-password');
    const strengthFill = document.getElementById('strength-bar-fill');
    const strengthText = document.getElementById('strength-text');

    if (regPassInput && strengthFill) {
      regPassInput.addEventListener('input', () => {
        const val = regPassInput.value;
        let score = 0;
        if (val.length >= 6) score += 25;
        if (val.length >= 10) score += 25;
        if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score += 25;
        if (/[0-9]/.test(val) && /[^A-Za-z0-9]/.test(val)) score += 25;

        strengthFill.style.width = score + '%';
        if (score <= 25) {
          strengthFill.style.backgroundColor = '#ef4444';
          if (strengthText) strengthText.textContent = 'ระดับ: ง่ายมาก (Weak)';
        } else if (score <= 50) {
          strengthFill.style.backgroundColor = '#f59e0b';
          if (strengthText) strengthText.textContent = 'ระดับ: ปานกลาง (Medium)';
        } else if (score <= 75) {
          strengthFill.style.backgroundColor = '#38bdf8';
          if (strengthText) strengthText.textContent = 'ระดับ: ปลอดภัย (Good)';
        } else {
          strengthFill.style.backgroundColor = '#10b981';
          if (strengthText) strengthText.textContent = 'ระดับ: ปลอดภัยสูงมาก (Strong)';
        }
      });
    }

    // Form Submissions
    if (formLogin) {
      formLogin.addEventListener('submit', (e) => this.handleLogin(e));
    }
    if (formRegister) {
      formRegister.addEventListener('submit', (e) => this.handleRegister(e));
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const passOrPin = document.getElementById('login-password').value.trim();

    if (!username || !passOrPin) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณากรอกข้อมูล',
        text: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน / PIN',
        background: '#180a2f',
        color: '#fff',
        confirmButtonColor: '#d946ef'
      });
      return;
    }

    if (!window.supabaseManager.isConnected) {
      Swal.fire({
        icon: 'warning',
        title: 'ยังไม่ได้เชื่อมต่อฐานข้อมูล',
        text: 'กรุณาเชื่อมต่อ Supabase Database ก่อนเข้าสู่ระบบ',
        confirmButtonText: 'เชื่อมต่อ Supabase ตอนนี้',
        background: '#180a2f',
        color: '#fff',
        confirmButtonColor: '#d946ef'
      }).then(() => {
        window.openSupabaseConfigModal();
      });
      return;
    }

    try {
      const client = window.supabaseManager.client;
      const { data: users, error } = await client
        .from('profiles')
        .select('*')
        .eq('username', username);

      if (error) throw error;

      const user = users && users.find(p => p.password_hash === passOrPin || p.pin === passOrPin);

      if (user) {
        this.saveCurrentUser({
          id: user.id,
          username: user.username,
          role: user.role,
          balance: Number(user.balance) || 0
        });

        this.closeAuthModal();
        Swal.fire({
          icon: 'success',
          title: `ยินดีต้อนรับคุณ ${user.username}!`,
          text: `เข้าสู่ระบบสำเร็จในฐานะ [${user.role.toUpperCase()}]`,
          timer: 1800,
          showConfirmButton: false,
          background: '#180a2f',
          color: '#fff'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'เข้าสู่ระบบไม่สำเร็จ',
          text: 'ชื่อผู้ใช้งาน รหัสผ่าน หรือ PIN ไม่ถูกต้องในฐานข้อมูล Supabase',
          background: '#180a2f',
          color: '#fff',
          confirmButtonColor: '#ef4444'
        });
      }
    } catch (err) {
      console.error('Login error:', err);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
        text: err.message || 'ไม่สามารถตรวจสอบข้อมูลกับ Supabase ได้',
        background: '#180a2f',
        color: '#fff'
      });
    }
  }

  async handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const pin = document.getElementById('reg-pin').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    if (username.length < 3) {
      Swal.fire({ icon: 'warning', title: 'ชื่อผู้ใช้งานสั้นเกินไป', text: 'ชื่อผู้ใช้งานต้องมีความยาวอย่างน้อย 3 ตัวอักษร', background: '#180a2f', color: '#fff', confirmButtonColor: '#d946ef' });
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      Swal.fire({ icon: 'warning', title: 'PIN ไม่ถูกต้อง', text: 'PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น', background: '#180a2f', color: '#fff', confirmButtonColor: '#d946ef' });
      return;
    }
    if (password.length < 6) {
      Swal.fire({ icon: 'warning', title: 'รหัสผ่านสั้นเกินไป', text: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', background: '#180a2f', color: '#fff', confirmButtonColor: '#d946ef' });
      return;
    }
    if (password !== confirmPassword) {
      Swal.fire({ icon: 'error', title: 'รหัสผ่านไม่ตรงกัน', text: 'กรุณากรอกยืนยันรหัสผ่านให้ตรงกัน', background: '#180a2f', color: '#fff', confirmButtonColor: '#ef4444' });
      return;
    }

    if (!window.supabaseManager.isConnected) {
      Swal.fire({
        icon: 'warning',
        title: 'ยังไม่ได้เชื่อมต่อฐานข้อมูล',
        text: 'กรุณาเชื่อมต่อ Supabase Database ก่อนสมัครสมาชิก',
        confirmButtonText: 'เชื่อมต่อ Supabase ตอนนี้',
        background: '#180a2f',
        color: '#fff',
        confirmButtonColor: '#d946ef'
      }).then(() => {
        window.openSupabaseConfigModal();
      });
      return;
    }

    try {
      const client = window.supabaseManager.client;
      
      // Check existing username in Supabase
      const { data: existing, error: checkErr } = await client
        .from('profiles')
        .select('username')
        .eq('username', username);

      if (checkErr) throw checkErr;
      if (existing && existing.length > 0) {
        Swal.fire({ icon: 'error', title: 'ชื่อนี้มีผู้ใช้งานแล้ว', text: 'กรุณาเลือกชื่อผู้ใช้งานอื่น', background: '#180a2f', color: '#fff', confirmButtonColor: '#ef4444' });
        return;
      }

      // Check if this is the very first account created, make it admin if none exists
      const { data: allProfiles } = await client.from('profiles').select('id');
      const assignedRole = (!allProfiles || allProfiles.length === 0) ? 'admin' : 'member';

      const newUser = {
        username: username,
        pin: pin,
        password_hash: password,
        role: assignedRole,
        balance: 0.00
      };

      const { data: inserted, error: insertErr } = await client
        .from('profiles')
        .insert([newUser])
        .select();

      if (insertErr) throw insertErr;

      const createdUser = inserted[0];
      this.saveCurrentUser({
        id: createdUser.id,
        username: createdUser.username,
        role: createdUser.role,
        balance: Number(createdUser.balance) || 0
      });

      this.closeAuthModal();

      Swal.fire({
        icon: 'success',
        title: 'สมัครสมาชิกสำเร็จ!',
        html: `ยินดีต้อนรับคุณ <b>${createdUser.username}</b> (${createdUser.role.toUpperCase()})<br>บันทึกเข้าสู่ระบบ Supabase เรียบร้อยแล้ว`,
        background: '#180a2f',
        color: '#fff',
        confirmButtonColor: '#d946ef'
      });
    } catch (err) {
      console.error('Registration error:', err);
      Swal.fire({
        icon: 'error',
        title: 'สมัครสมาชิกไม่สำเร็จ',
        text: err.message || 'ไม่สามารถบันทึกข้อมูลไปยัง Supabase ได้',
        background: '#180a2f',
        color: '#fff'
      });
    }
  }

  logout() {
    this.saveCurrentUser(null);
    Swal.fire({
      icon: 'info',
      title: 'ออกจากระบบแล้ว',
      timer: 1500,
      showConfirmButton: false,
      background: '#180a2f',
      color: '#fff'
    });
  }

  updateUserUI() {
    const user = this.currentUser;
    const navLoggedOut = document.getElementById('nav-logged-out');
    const navLoggedIn = document.getElementById('nav-logged-in');
    const userNameEl = document.getElementById('nav-user-name');
    const userRoleEl = document.getElementById('nav-user-role');
    const userBalanceEl = document.getElementById('nav-user-balance');
    const adminBtn = document.getElementById('btn-admin-panel-nav');

    if (user) {
      if (navLoggedOut) navLoggedOut.style.display = 'none';
      if (navLoggedIn) navLoggedIn.style.display = 'flex';
      if (userNameEl) userNameEl.textContent = user.username;
      
      if (userRoleEl) {
        userRoleEl.textContent = user.role.toUpperCase();
        userRoleEl.className = `user-role-badge role-${user.role}`;
      }

      if (userBalanceEl) {
        userBalanceEl.textContent = `฿ ${Number(user.balance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      }

      if (adminBtn) {
        adminBtn.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
      }
    } else {
      if (navLoggedOut) navLoggedOut.style.display = 'flex';
      if (navLoggedIn) navLoggedIn.style.display = 'none';
      if (adminBtn) adminBtn.style.display = 'none';
    }
  }

  openAuthModal(initialTab = 'register') {
    const modal = document.getElementById('modal-auth');
    if (!modal) return;
    modal.classList.add('active');

    if (initialTab === 'login') {
      const tabLogin = document.getElementById('tab-btn-login');
      if (tabLogin) tabLogin.click();
    } else {
      const tabRegister = document.getElementById('tab-btn-register');
      if (tabRegister) tabRegister.click();
    }
  }

  closeAuthModal() {
    const modal = document.getElementById('modal-auth');
    if (modal) modal.classList.remove('active');
  }
}

window.authManager = new AuthManager();
