"use client";

import { useState, useEffect } from 'react';

export default function Home() {
  const [slipOkData, setSlipOkData] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [backendStatus, setBackendStatus] = useState('checking'); // 'connected' | 'standalone' | 'checking'
  const [branchId, setBranchId] = useState('78528');
  const [apiKey, setApiKey] = useState('SLIPOKRQF9YV8');
  const [expectedReceiver, setExpectedReceiver] = useState('0815993194');
  const [amountInput, setAmountInput] = useState('');

  // Auto-sync configuration from Little Cloud Shop server
  useEffect(() => {
    async function syncConfig() {
      try {
        const res = await fetch('http://localhost:3000/api/slip/config', { cache: 'no-store' });
        if (res.ok) {
          const cfg = await res.json();
          if (cfg.branch_id) setBranchId(String(cfg.branch_id));
          if (cfg.api_key) setApiKey(cfg.api_key);
          if (cfg.promptpay_number) setExpectedReceiver(cfg.promptpay_number);
          setBackendStatus('connected');
        } else {
          setBackendStatus('standalone');
        }
      } catch (e) {
        setBackendStatus('standalone');
      }
    }
    syncConfig();
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
      setSlipOkData(null);
      setErrorMsg('');
      setErrorCode('');
    }
  };

  const handleLoadSample = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      setErrorCode('');
      const sampleUrl = '/432690985_814835843801601_4395314745528656572_n.jpg';
      setPreviewUrl(sampleUrl);
      const resp = await fetch(sampleUrl);
      const blob = await resp.blob();
      const sampleFile = new File([blob], 'sample_slip.jpg', { type: 'image/jpeg' });
      setFile(sampleFile);
      setLoading(false);
    } catch (e) {
      setErrorMsg('ไม่สามารถโหลดภาพตัวอย่างได้: ' + e.message);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file && !previewUrl) {
      setErrorMsg('กรุณาเลือกไฟล์สลิปก่อนกดตรวจสอบ');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setErrorCode('');
    setSlipOkData(null);

    try {
      // 1. Convert File to Base64
      let base64 = '';
      if (file) {
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      // 2. Try Calling Little Cloud Shop Backend (port 3000) or internal Next.js API
      const endpoints = [
        'http://localhost:3000/api/slip/check',
        'http://127.0.0.1:3000/api/slip/check',
        '/api/check-slip'
      ];

      let resData = null;
      let lastErr = null;
      let lastCode = null;

      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slip_data: base64,
              amount: amountInput ? Number(amountInput) : undefined,
              branch_id: branchId,
              api_key: apiKey
            })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            resData = data;
            break;
          } else {
            lastErr = data.message || `เกิดข้อผิดพลาด (HTTP ${res.status})`;
            lastCode = data.code || 'VALIDATION_FAILED';
            if (res.status === 400 || res.status === 403) {
              // Known business validation failure (e.g. DUPLICATE_SLIP, WRONG_RECEIVER)
              break;
            }
          }
        } catch (fetchErr) {
          lastErr = fetchErr.message;
        }
      }

      if (resData && resData.data) {
        setSlipOkData(resData.data);
      } else {
        setErrorCode(lastCode || 'ERROR');
        throw new Error(lastErr || 'การตรวจสอบสลิปล้มเหลว');
      }

    } catch (err) {
      console.error('Slip check error:', err);
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการตรวจสอบสลิป');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0b0c14] text-white p-4 md:p-8 font-sans selection:bg-pink-500 selection:text-white">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800/80 pb-6 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl animate-bounce">⚡</span>
              <h1 className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-pink-400 via-rose-300 to-amber-200 bg-clip-text text-transparent">
                Little Cloud x SlipOK AI
              </h1>
            </div>
            <p className="text-gray-400 text-xs md:text-sm mt-1.5 flex items-center gap-2">
              <span>ระบบตรวจสอบสลิปโอนเงินอัตโนมัติ Real-Time Bank Switch Integration</span>
              {backendStatus === 'connected' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
                  เชื่อมต่อ Little Cloud Port 3000 แล้ว
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950 text-amber-400 border border-amber-800/50">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5"></span>
                  โหมด Standalone SlipOK
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="http://localhost:3000"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white text-xs md:text-sm font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-pink-500/25 active:scale-95"
            >
              <span>🏪</span> กลับหน้าร้าน Little Cloud Shop
            </a>
          </div>
        </div>

        {/* Credentials & System Guard Bar */}
        <div className="bg-[#141522] border border-gray-800 rounded-2xl p-5 mb-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h2 className="text-xs md:text-sm font-bold text-gray-200 flex items-center gap-2">
              <span>⚙️</span> การตั้งค่า SlipOK API & ความปลอดภัยของร้าน
            </h2>
            <div className="text-[11px] text-pink-400 bg-pink-950/40 border border-pink-900/50 px-2.5 py-1 rounded-lg">
              🛡️ บัญชีร้านที่ยอมรับ: <b>{expectedReceiver}</b>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">SlipOK Branch ID</label>
              <input
                type="text"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                placeholder="เช่น 78528"
                className="w-full bg-[#0d0e17] border border-gray-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">SlipOK API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="SLIPOKR..."
                className="w-full bg-[#0d0e17] border border-gray-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">ตรวจสอบยอดเงินเจาะจง (ถ้ามี / บาท)</label>
              <input
                type="number"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="เว้นว่างไว้เพื่อตรวจตามจริง"
                className="w-full bg-[#0d0e17] border border-gray-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Two Column Workspace */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Left Column: Upload Form & Preview */}
          <div className="bg-[#141522] border border-gray-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>📷</span> อัปโหลดรูปภาพสลิปเพื่อทดสอบ
              </span>
              <span className="text-[11px] font-normal text-gray-500">รองรับ QR Slip ทุกธนาคาร</span>
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-gray-400 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-gradient-to-r file:from-pink-600 file:to-rose-600 file:text-white hover:file:from-pink-500 hover:file:to-rose-500 cursor-pointer bg-[#0d0e17] p-2 rounded-xl border border-gray-700/80"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs md:text-sm transition shadow-lg shadow-pink-500/20 active:scale-95"
                >
                  {loading ? '⏳ กำลังตรวจสอบกับ SlipOK AI...' : '🔍 ตรวจสอบสลิปทันที'}
                </button>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="bg-[#212338] hover:bg-[#2b2e49] text-gray-300 text-xs font-semibold px-3 py-2 rounded-xl transition"
                >
                  โหลดสลิปตัวอย่าง
                </button>
              </div>
            </form>

            {/* Error / Alert Message */}
            {errorMsg && (
              <div className="mt-4 bg-red-950/60 border border-red-500/50 rounded-xl p-3.5 text-red-200 text-xs leading-relaxed animate-shake">
                <div className="flex items-center gap-2 font-bold text-red-400 mb-1">
                  <span>❌</span>
                  <span>{errorCode === 'DUPLICATE_SLIP' ? 'สลิปนี้เคยถูกใช้งานแล้ว (สลิปซ้ำ)' : errorCode === 'WRONG_RECEIVER' ? 'บัญชีผู้รับเงินไม่ถูกต้อง' : 'การตรวจสอบไม่ผ่าน'}</span>
                </div>
                <div className="text-gray-300">{errorMsg}</div>
                {errorCode === 'DUPLICATE_SLIP' && (
                  <div className="mt-2 text-[11px] text-amber-300/90 bg-amber-950/40 p-2 rounded border border-amber-800/40">
                    💡 ระบบ Little Cloud Shop ป้องกันการนำสลิปเก่ามาใช้ซ้ำ 100% เพื่อความปลอดภัยของร้านค้า
                  </div>
                )}
                {errorCode === 'WRONG_RECEIVER' && (
                  <div className="mt-2 text-[11px] text-amber-300/90 bg-amber-950/40 p-2 rounded border border-amber-800/40">
                    💡 สลิปนี้ไม่ได้โอนเข้าเบอร์พร้อมเพย์ร้าน ({expectedReceiver}) จึงไม่สามารถรับยอดเงินได้
                  </div>
                )}
              </div>
            )}

            {/* Image Preview Box */}
            <div className="mt-4 bg-[#0a0b12] border border-gray-800/80 rounded-xl p-3 flex flex-col items-center justify-center min-h-[300px]">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Slip Preview"
                  className="max-h-[360px] max-w-full object-contain rounded-lg shadow-xl"
                />
              ) : (
                <div className="text-center text-gray-500 text-xs p-6">
                  <div className="text-4xl mb-2 opacity-30">📄</div>
                  <div className="font-semibold text-gray-400">ยังไม่มีการเลือกไฟล์สลิป</div>
                  <div className="text-[11px] text-gray-600 mt-1">อัปโหลดภาพสลิปเพื่อทดสอบการอ่านค่า QR Code & SlipOK</div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: SlipOK AI Results */}
          <div className="bg-[#141522] border border-gray-800 rounded-2xl p-5 shadow-xl">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <span>📊</span> ผลลัพธ์การตรวจสอบ (SlipOK Verification)
            </h2>

            {slipOkData ? (
              <div className="space-y-4">
                {/* Status Card */}
                <div className="bg-emerald-950/50 border border-emerald-500/50 rounded-xl p-4 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 text-lg font-bold">
                      ✓
                    </div>
                    <div>
                      <div className="font-extrabold text-emerald-400 text-sm">สลิปถูกต้อง & ตรวจสอบผ่าน</div>
                      <div className="text-[11px] text-emerald-200/70">ข้อมูลตรงกับฐานข้อมูลธนาคารผ่านระบบ SlipOK</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-emerald-400 font-mono">
                      ฿{Number(slipOkData.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-gray-400">ยอดเงินที่ได้รับ</div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="bg-[#0d0e17] border border-gray-800 rounded-xl divide-y divide-gray-800/80 text-xs">
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-gray-400">ผู้รับโอนเงิน:</span>
                    <span className="font-bold text-emerald-300">
                      {slipOkData.receiver?.displayName || slipOkData.receiver?.name || '-'}
                    </span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-gray-400">ธนาคาร / ช่องทางผู้รับ:</span>
                    <span className="font-semibold text-rose-300">
                      {slipOkData.receivingBankName || slipOkData.receivingBank || 'PromptPay'}
                    </span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-gray-400">ผู้โอนเงิน:</span>
                    <span className="font-bold text-white">
                      {slipOkData.sender?.displayName || slipOkData.sender?.name || '-'}
                    </span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-gray-400">ธนาคารผู้โอน:</span>
                    <span className="font-semibold text-sky-300">
                      {slipOkData.sendingBankName || slipOkData.sendingBank || '-'}
                    </span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-gray-400">วัน-เวลาที่โอน:</span>
                    <span className="font-mono text-white">
                      {slipOkData.transDate || ''} {slipOkData.transTime || ''}
                    </span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-gray-400">รหัสอ้างอิงธุรกรรม:</span>
                    <code className="bg-[#181a28] px-2 py-0.5 rounded text-amber-300 font-mono text-[11px] border border-gray-700/50">
                      {slipOkData.transRef || '-'}
                    </code>
                  </div>
                </div>

                {/* Receiver Verification Badge */}
                <div className="bg-[#0d0e17] border border-emerald-800/30 rounded-xl p-3 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-base">🛡️</span>
                    <div>
                      <div className="text-gray-200 font-semibold">บัญชีผู้รับเงินของร้านค้า</div>
                      <div className="text-[11px] text-gray-400">
                        บัญชีปลายทาง: <span className="text-emerald-400 font-mono font-bold">{expectedReceiver}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] bg-emerald-950 text-emerald-400 px-2 py-1 rounded font-bold border border-emerald-800/50">
                    ยืนยันถูกต้อง
                  </span>
                </div>

                {/* Raw JSON Data Accordion */}
                <details className="bg-[#0d0e17] border border-gray-800 rounded-xl p-3 text-xs text-gray-400">
                  <summary className="cursor-pointer font-bold text-gray-300 hover:text-white transition flex items-center justify-between">
                    <span>ดูข้อมูลดิบ SlipOK (Raw JSON Data)</span>
                    <span className="text-[10px] text-pink-400">คลิกเพื่อดู</span>
                  </summary>
                  <pre className="mt-3 p-3 bg-[#06070a] rounded-lg text-[11px] text-emerald-400 overflow-x-auto max-h-60 font-mono border border-gray-800">
                    {JSON.stringify(slipOkData, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="bg-[#0d0e17] border border-dashed border-gray-800 rounded-xl p-10 text-center text-gray-500 text-xs">
                <div className="text-4xl mb-3 opacity-30">🔍</div>
                <div className="text-gray-300 font-bold mb-1">ยังไม่มีผลการตรวจสอบ</div>
                <div className="text-gray-500">กรุณาเลือกรูปภาพสลิปแล้วกดปุ่ม &quot;ตรวจสอบสลิปทันที&quot; เพื่อส่งตรวจกับ SlipOK AI</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
