-- ==============================================================================
-- LITTLE CLOUD SHOP - SUPABASE DATABASE SCHEMA
-- Copy and run this script in the Supabase SQL Editor (https://app.supabase.com)
-- ==============================================================================

-- 1. Create Profiles Table (Users with Roles: 'admin' | 'member')
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    pin TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Products Table (Game Currency 'เงิน M' & Weapon Skins 'สกินอาวุธ')
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('เงิน M', 'สกินอาวุธ', 'ไอดีเกม', 'อื่นๆ')),
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    original_price NUMERIC(10, 2),
    stock INT NOT NULL DEFAULT 10,
    image_url TEXT,
    badge_text TEXT,
    server_tag TEXT,
    is_popular BOOLEAN DEFAULT false,
    delivery_data TEXT, -- Code / Item info given to member after purchase
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    total_price NUMERIC(10, 2) NOT NULL,
    delivery_code TEXT,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Topups Table
CREATE TABLE IF NOT EXISTS topups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    payment_method TEXT NOT NULL, -- 'PromptPay QR', 'SlipOK API', 'TrueMoney', 'Redeem Code'
    slip_url TEXT,
    transaction_ref TEXT UNIQUE, -- Idempotency key (prevent duplicate credits)
    gateway_ref TEXT, -- Bank / Slip transfer reference code
    verified_by TEXT DEFAULT 'Payment Gateway',
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Wallet Transactions Table (Immutable Audit Ledger for Reconciliation)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('topup', 'purchase', 'refund', 'admin_adjustment')),
    amount NUMERIC(12, 2) NOT NULL,
    balance_before NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    reference_id TEXT UNIQUE, -- Idempotency key (Order ID / Topup Ref)
    gateway_ref TEXT, -- Gateway / Slip Transaction Reference
    description TEXT,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'pending')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    product_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Create Site Settings Table (Admin customizes all aspects of site + Payment Gateway API)
CREATE TABLE IF NOT EXISTS site_settings (
    id TEXT PRIMARY KEY DEFAULT 'main_config',
    shop_name TEXT NOT NULL DEFAULT 'Little Cloud Shop',
    shop_tagline TEXT NOT NULL DEFAULT 'ศูนย์รวมบริการ เงิน M และสกินอาวุธ FiveM / GTA / Game Online คุณภาพอันดับ 1',
    announcement TEXT NOT NULL DEFAULT '⚡ โปรโมชั่นเปิดร้านใหม่! เติมเงินครั้งแรกรับโบนัส 10% ทันที | จัดส่งสินค้าไว อัตโนมัติ 24 ชม.',
    hero_title TEXT NOT NULL DEFAULT 'ยินดีต้อนรับสู่ Little Cloud Shop',
    hero_subtitle TEXT NOT NULL DEFAULT 'บริการขาย เงิน M, สกินอาวุธพรีเมียม, Modding ตลอด 24 ชั่วโมง !!',
    banner_url TEXT DEFAULT '',
    contact_facebook TEXT DEFAULT 'https://facebook.com',
    contact_discord TEXT DEFAULT 'https://discord.gg',
    contact_line TEXT DEFAULT '@littlecloud',
    promptpay_number TEXT DEFAULT '0815993194',
    promptpay_name TEXT DEFAULT 'Little Cloud Shop Official',
    gateway_provider TEXT DEFAULT 'promptpay_slipok', -- 'promptpay_slipok', 'easyslip', 'promptpay_auto'
    gateway_api_key TEXT DEFAULT '', -- SlipOK API Key / Gateway Secret Key
    gateway_branch_id TEXT DEFAULT '', -- SlipOK Branch ID
    gateway_secret TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if tables were created previously
ALTER TABLE topups ADD COLUMN IF NOT EXISTS transaction_ref TEXT;
ALTER TABLE topups ADD COLUMN IF NOT EXISTS gateway_ref TEXT;
ALTER TABLE topups ADD COLUMN IF NOT EXISTS verified_by TEXT DEFAULT 'Payment Gateway';

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS gateway_provider TEXT DEFAULT 'promptpay_slipok';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS gateway_api_key TEXT DEFAULT '';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS gateway_branch_id TEXT DEFAULT '';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS gateway_secret TEXT DEFAULT '';

-- 8. Create Topup Transactions Table (Omise / Payment Gateway Transactions)
CREATE TABLE IF NOT EXISTS topup_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    username TEXT,
    omise_charge_id TEXT UNIQUE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
    qr_code_url TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Create Credit Logs Table (Immutable Audit Ledger for Every Credit Movement)
CREATE TABLE IF NOT EXISTS credit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    username TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('topup', 'purchase', 'refund', 'admin_adjustment')),
    ref_transaction_id TEXT,
    balance_before NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE topup_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to allow safe re-running without ERROR 42710
DROP POLICY IF EXISTS "Public Read Profiles" ON profiles;
DROP POLICY IF EXISTS "Public Insert Profiles" ON profiles;
DROP POLICY IF EXISTS "Public Update Profiles" ON profiles;

DROP POLICY IF EXISTS "Public Read Products" ON products;
DROP POLICY IF EXISTS "Public Insert Products" ON products;
DROP POLICY IF EXISTS "Public Update Products" ON products;
DROP POLICY IF EXISTS "Public Delete Products" ON products;

DROP POLICY IF EXISTS "Public Read Orders" ON orders;
DROP POLICY IF EXISTS "Public Insert Orders" ON orders;

DROP POLICY IF EXISTS "Public Read Topups" ON topups;
DROP POLICY IF EXISTS "Public Insert Topups" ON topups;
DROP POLICY IF EXISTS "Public Update Topups" ON topups;

DROP POLICY IF EXISTS "Public Read Wallet Transactions" ON wallet_transactions;
DROP POLICY IF EXISTS "Public Insert Wallet Transactions" ON wallet_transactions;

DROP POLICY IF EXISTS "Public Read Reviews" ON reviews;
DROP POLICY IF EXISTS "Public Insert Reviews" ON reviews;

DROP POLICY IF EXISTS "Public Read Site Settings" ON site_settings;
DROP POLICY IF EXISTS "Public Update Site Settings" ON site_settings;
DROP POLICY IF EXISTS "Public Insert Site Settings" ON site_settings;

DROP POLICY IF EXISTS "Public Read Topup Transactions" ON topup_transactions;
DROP POLICY IF EXISTS "Public Insert Topup Transactions" ON topup_transactions;
DROP POLICY IF EXISTS "Public Update Topup Transactions" ON topup_transactions;

DROP POLICY IF EXISTS "Public Read Credit Logs" ON credit_logs;
DROP POLICY IF EXISTS "Public Insert Credit Logs" ON credit_logs;

-- Create Policies for Anon access
CREATE POLICY "Public Read Profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Public Insert Profiles" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Profiles" ON profiles FOR UPDATE USING (true);

CREATE POLICY "Public Read Products" ON products FOR SELECT USING (true);
CREATE POLICY "Public Insert Products" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Products" ON products FOR UPDATE USING (true);
CREATE POLICY "Public Delete Products" ON products FOR DELETE USING (true);

CREATE POLICY "Public Read Orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Public Insert Orders" ON orders FOR INSERT WITH CHECK (true);

CREATE POLICY "Public Read Topups" ON topups FOR SELECT USING (true);
CREATE POLICY "Public Insert Topups" ON topups FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Topups" ON topups FOR UPDATE USING (true);

CREATE POLICY "Public Read Wallet Transactions" ON wallet_transactions FOR SELECT USING (true);
CREATE POLICY "Public Insert Wallet Transactions" ON wallet_transactions FOR INSERT WITH CHECK (true);

CREATE POLICY "Public Read Reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "Public Insert Reviews" ON reviews FOR INSERT WITH CHECK (true);

CREATE POLICY "Public Read Site Settings" ON site_settings FOR SELECT USING (true);
CREATE POLICY "Public Update Site Settings" ON site_settings FOR UPDATE USING (true);
CREATE POLICY "Public Insert Site Settings" ON site_settings FOR INSERT WITH CHECK (true);

CREATE POLICY "Public Read Topup Transactions" ON topup_transactions FOR SELECT USING (true);
CREATE POLICY "Public Insert Topup Transactions" ON topup_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Topup Transactions" ON topup_transactions FOR UPDATE USING (true);

CREATE POLICY "Public Read Credit Logs" ON credit_logs FOR SELECT USING (true);
CREATE POLICY "Public Insert Credit Logs" ON credit_logs FOR INSERT WITH CHECK (true);

-- Atomic Stored Procedure / RPC for Safe Wallet Crediting (Anti-Race Condition & Idempotent)
CREATE OR REPLACE FUNCTION credit_user_wallet_atomic(
    p_user_id UUID,
    p_charge_id TEXT,
    p_amount NUMERIC,
    p_type TEXT DEFAULT 'topup',
    p_description TEXT DEFAULT 'Omise PromptPay Topup'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile RECORD;
    v_new_balance NUMERIC;
    v_tx_status TEXT;
BEGIN
    -- 1. Check if transaction exists and if already completed (Idempotency check)
    SELECT status INTO v_tx_status FROM topup_transactions WHERE omise_charge_id = p_charge_id;
    IF v_tx_status = 'completed' THEN
        SELECT balance INTO v_new_balance FROM profiles WHERE id = p_user_id;
        RETURN jsonb_build_object('success', true, 'message', 'Already credited', 'balance', v_new_balance, 'idempotent', true);
    END IF;

    -- 2. Lock profile row FOR UPDATE to prevent race conditions
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User profile not found with ID %', p_user_id;
    END IF;

    v_new_balance := v_profile.balance + p_amount;

    -- 3. Update profile balance
    UPDATE profiles
    SET balance = v_new_balance, updated_at = NOW()
    WHERE id = p_user_id;

    -- 4. Mark topup_transactions as completed
    UPDATE topup_transactions
    SET status = 'completed', updated_at = NOW()
    WHERE omise_charge_id = p_charge_id;

    -- 5. Insert Immutable Log into credit_logs
    INSERT INTO credit_logs (user_id, username, amount, type, ref_transaction_id, balance_before, balance_after, description)
    VALUES (p_user_id, v_profile.username, p_amount, p_type, p_charge_id, v_profile.balance, v_new_balance, p_description);

    -- 6. Insert into wallet_transactions for backward compatibility / double-entry ledger
    INSERT INTO wallet_transactions (user_id, username, type, amount, balance_before, balance_after, reference_id, gateway_ref, description, status)
    VALUES (p_user_id, v_profile.username, p_type, p_amount, v_profile.balance, v_new_balance, p_charge_id, 'OMISE-' || p_charge_id, p_description, 'completed')
    ON CONFLICT (reference_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'amount', p_amount,
        'balance_before', v_profile.balance,
        'balance_after', v_new_balance
    );
END;
$$;

-- Seed Initial Site Settings
INSERT INTO site_settings (id, shop_name, shop_tagline, announcement, hero_title, hero_subtitle, promptpay_number, promptpay_name, gateway_provider)
VALUES (
    'main_config',
    'Little Cloud Shop',
    'ศูนย์รวมบริการ เงิน M และสกินอาวุธ FiveM / GTA / Game Online คุณภาพอันดับ 1',
    '⚡ โปรโมชั่นเปิดร้านใหม่! เติมเงินครั้งแรกรับโบนัส 10% ทันที | จัดส่งสินค้าไว อัตโนมัติ 24 ชม.',
    'ยินดีต้อนรับสู่ Little Cloud Shop',
    'บริการขาย เงิน M, สกินอาวุธพรีเมียม, Modding ตลอด 24 ชั่วโมง !!',
    '0815993194',
    'Little Cloud Shop Official',
    'promptpay_slipok'
) ON CONFLICT (id) DO UPDATE SET promptpay_number = EXCLUDED.promptpay_number, promptpay_name = EXCLUDED.promptpay_name;

-- Seed Default Admin & Demo Member
-- (Passwords are hashed in app or demo plaintext for testing)
INSERT INTO profiles (username, pin, password_hash, role, balance)
VALUES 
('admin', '123456', 'admin123', 'admin', 99999.00),
('member', '123456', 'member123', 'member', 500.00),
('cloudgamer', '654321', 'gamer123', 'member', 1250.00)
ON CONFLICT (username) DO NOTHING;

-- Seed Initial Products (เงิน M & Weapon Skins according to Image 2 style)
INSERT INTO products (name, category, description, price, original_price, stock, image_url, badge_text, server_tag, is_popular, delivery_data)
VALUES
('GARDIAN V.1 (Skin Pack)', 'สกินอาวุธ', 'สกินอาวุธ Gardian V.1 ลายพิเศษ คมชัดระดับ 4K ใช้งานได้ทุกเซิร์ฟเวอร์ FiveM มีประกายแสงสีม่วงนีออน', 20.00, 25.00, 19, 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80', '-5฿', 'FiveM All City', true, 'GARD-V1-99281-KEY-SPECIAL'),
('เงิน M FiveM เซิร์ฟเวอร์หลัก (1M)', 'เงิน M', 'เงิน M สะอาด 100% ฟาร์มมือ ปลอดภัย ไม่โดนแบน ส่งของทันทีผ่านระบบตู้เซฟหรือนัดรับในเกม', 50.00, 60.00, 150, 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80', 'ขายดี 🔥', 'Server 1', true, 'RECEIVE-LOC: Green Safehouse Room 4 (Call 089-XXX)'),
('เงิน M เซิร์ฟเวอร์ City Of God (5M)', 'เงิน M', 'แพ็กเกจประหยัด 5 ล้าน M โอนไวภายใน 3 นาที ปลอดภัย การันตีเงินสะอาด 100%', 220.00, 250.00, 45, 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?auto=format&fit=crop&w=600&q=80', '-30฿', 'City of God', true, 'RECEIVE-LOC: Bank Vault Downtown #12'),
('VIOLET CYBER KATANA', 'สกินอาวุธ', 'ดาบคาตานะเอฟเฟกต์แสงสีม่วงนีออน มีแอนิเมชันชักดาบและเสียงฟันพิเศษ', 89.00, 120.00, 12, 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=600&q=80', '-31฿', 'FiveM & GTA', true, 'SKIN-KATANA-PURPLE-88301'),
('PHANTOM GLOCK 18 FULL AUTO', 'สกินอาวุธ', 'ปืนสั้น Phantom Glock สีม่วงเมทัลลิก พ่นไฟสีกระบอกปืน Custom Sound ปรับแต่งยิงรัว', 45.00, 55.00, 28, 'https://images.unsplash.com/photo-1589241062272-c0a000072dfa?auto=format&fit=crop&w=600&q=80', '-10฿', 'FiveM All City', false, 'GLOCK-PHANTOM-MOD-7719'),
('NEON REVOLVER LUXURY', 'สกินอาวุธ', 'รีวอลเวอร์เรืองแสง ลายคัสตอมพรีเมียม สวยสะดุดตาทุกช็อต', 35.00, 45.00, 15, 'https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?auto=format&fit=crop&w=600&q=80', 'ใหม่ ✨', 'FiveM', false, 'REVOLVER-LUX-PURPLE-0021'),
('เงิน M เซิร์ฟเวอร์ Wonderland (10M)', 'เงิน M', 'แพ็กเกจใหญ่จุใจ 10M เรทดีที่สุดในตลาด แถมฟรีไอเทมเสริมในเมือง', 400.00, 490.00, 20, 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=600&q=80', 'คุ้มสุด 🚀', 'Wonderland', true, 'RECEIVE-LOC: Airport Hangar #3'),
('CYBERPUNK SNIPER AWP', 'สกินอาวุธ', 'สกินปืนสไนเปอร์ลวดลายไฮเทค แสงเลเซอร์สีม่วงส่องประกาย', 119.00, 150.00, 8, 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=600&q=80', '-31฿', 'FiveM & GTA', true, 'AWP-CYBER-PURPLE-1192');

-- Seed Initial Reviews
INSERT INTO reviews (username, rating, comment, product_name)
VALUES
('GamerPro_TH', 5, 'ส่งเงิน M ไวมากครับ ไม่ถึง 2 นาทีได้รับแล้ว แอดมินตอบแชทสุภาพ แนะนำเลยครับ!', 'เงิน M เซิร์ฟเวอร์หลัก (1M)'),
('Somchai_FiveM', 5, 'สกิน Gardian V.1 สวยจัดๆ ในเกมแสงสีม่วงเด่นมาก คุ้มราคา 20 บาทสุดๆ', 'GARDIAN V.1 (Skin Pack)'),
('NightRider99', 5, 'เติมเงินผ่านพร้อมเพย์เข้าออโต้เลย สะดวกมาก เว็บสวยใช้ง่ายครับ', 'เติมเงิน TOPUP'),
('Krit_Cyber', 5, 'ดาบคาตานะม่วงเท่มาก เสียงฟันเพราะ ขอบคุณ Little Cloud Shop ครับ ❤️', 'VIOLET CYBER KATANA');

-- Seed Initial Topups for Stats
INSERT INTO topups (username, amount, payment_method, status)
VALUES
('GamerPro_TH', 500.00, 'PromptPay QR', 'approved'),
('Somchai_FiveM', 200.00, 'PromptPay QR', 'approved'),
('NightRider99', 1000.00, 'TrueMoney', 'approved'),
('cloudgamer', 1250.00, 'PromptPay QR', 'approved'),
('member', 500.00, 'PromptPay QR', 'approved');

-- Seed Initial Orders for Stats
INSERT INTO orders (username, product_name, quantity, total_price, delivery_code, status)
VALUES
('GamerPro_TH', 'เงิน M FiveM เซิร์ฟเวอร์หลัก (1M)', 1, 50.00, 'RECEIVE-LOC: Green Safehouse Room 4', 'completed'),
('Somchai_FiveM', 'GARDIAN V.1 (Skin Pack)', 1, 20.00, 'GARD-V1-99281-KEY-SPECIAL', 'completed'),
('cloudgamer', 'VIOLET CYBER KATANA', 1, 89.00, 'SKIN-KATANA-PURPLE-88301', 'completed');
