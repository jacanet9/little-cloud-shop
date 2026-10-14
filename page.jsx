"use client";

import { useState } from 'react';

export default function Home() {
  const [slipOkData, setSlipOkData] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [branchId, setBranchId] = useState('77061');
  const [apiKey, setApiKey] = useState('SLIPOKM1QT19D');
  const [amountInput, setAmountInput] = useState('');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
      setSlipOkData(null);
      setErrorMsg('');
    }
  };

  const handleLoadSample = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
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

      // 2. Try Calling Little Cloud Shop Backend (port 3000) or internal API
      const endpoints = [
        'http://localhost:3000/api/slip/check',
        'http://127.0.0.1:3000/api/slip/check',
        '/api/check-slip'
      ];

      let resData = null;
      let lastErr = null;

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
          } else if (data.message) {
            lastErr = data.message;
          }
        } catch (fetchErr) {
          lastErr = fetchErr.message;
        }
      }

      if (resData && resData.data) {
        setSlipOkData(resData.data);
      } else {
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
    <main className="min-h-screen bg-[#0f1018] text-white p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <h1 className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-pink-500 to-rose-400 bg-clip-text text-transparent">
                Little Cloud x SlipOK AI
              </h1>
            </div>
            <p className="text-gray-400 text-sm mt-1">
              ระบบตรวจสอบสลิปโอนเงินอัตโนมัติด้วย AI & Bank Switch Integration
            </p>
          </div>
          <a
            href="http://localhost:3000"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-pink-500/20"
          >
            ← กลับหน้าเว็บ Little Cloud Shop
          </a>
        </div>

        {/* Credentials Bar */}
        <div className="bg-[#181926] border border-gray-800 rounded-2xl p-5 mb-6">
          <h2 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
            <span>⚙️</span> การตั้งค่า SlipOK API (ดึงจากระบบอัตโนมัติ)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">SlipOK Branch ID</label>
              <input
                type="text"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                placeholder="เช่น 77061"
                className="w-full bg-[#10111a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">SlipOK API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="x-authorization key"
                className="w-full bg-[#10111a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">ยอดเงินที่คาดหวัง (บาท / ถ้ามี)</label>
              <input
                type="number"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="เช่น 100"
                className="w-full bg-[#10111a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>
        </div>

        {/* Two Column Workspace */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Left Column: Upload Form & Preview */}
          <div className="bg-[#181926] border border-gray-800 rounded-2xl p-5">
            <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
              <span>📷</span> อัปโหลดรูปภาพสลิป
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-pink-600 file:text-white hover:file:bg-pink-500 cursor-pointer bg-[#10111a] p-2 rounded-xl border border-gray-700"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition shadow-md shadow-pink-500/20"
                >
                  {loading ? '⏳ กำลังตรวจสอบกับ SlipOK AI...' : '🔍 ตรวจสอบสลิป (Check Slip)'}
                </button>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="bg-[#24263a] hover:bg-[#2d3047] text-gray-300 text-xs font-semibold px-3 py-2 rounded-xl transition"
                >
                  โหลดสลิปตัวอย่าง
                </button>
              </div>
            </form>

            {/* Error Message */}
            {errorMsg && (
              <div className="mt-4 bg-red-950/50 border border-red-500/40 rounded-xl p-3 text-red-200 text-xs leading-relaxed">
                <b className="block text-red-400 font-bold mb-1">⚠️ ตรวจสอบไม่ผ่าน:</b>
                {errorMsg}
              </div>
            )}

            {/* Image Preview Box */}
            <div className="mt-4 bg-[#0a0b12] border border-gray-800 rounded-xl p-3 flex flex-col items-center justify-center min-h-[300px]">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Slip Preview"
                  className="max-h-[380px] max-w-full object-contain rounded-lg shadow-lg"
                />
              ) : (
                <div className="text-center text-gray-500 text-xs">
                  <div className="text-4xl mb-2 opacity-40">📄</div>
                  <div>ยังไม่มีการเลือกไฟล์สลิป</div>
                  <div className="text-[11px] text-gray-600 mt-1">รองรับ JPG, PNG, WEBP</div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: SlipOK AI Results */}
          <div className="bg-[#181926] border border-gray-800 rounded-2xl p-5">
            <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
              <span>📊</span> ผลลัพธ์การตรวจสอบ (SlipOK Data)
            </h2>

            {slipOkData ? (
              <div className="space-y-4">
                {/* Status Card */}
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-emerald-400 text-lg font-bold">
                      ✓
                    </div>
                    <div>
                      <div className="font-extrabold text-emerald-400 text-sm">สลิปโอนเงินถูกต้อง (Verified)</div>
                      <div className="text-xs text-gray-400">ตรวจสอบยืนยันข้อมูลผ่านระบบธนาคารเรียบร้อย</div>
                    </div>
                  </div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    ฿{Number(slipOkData.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="bg-[#10111a] border border-gray-800 rounded-xl divide-y divide-gray-800 text-sm">
                  <div className="p-3 flex justify-between">
                    <span className="text-gray-400 text-xs">ผู้รับโอนเงิน:</span>
                    <span className="font-bold text-white text-xs">{slipOkData.receiver?.displayName || '-'}</span>
                  </div>
                  <div className="p-3 flex justify-between">
                    <span className="text-gray-400 text-xs">ธนาคารผู้รับเงิน:</span>
                    <span className="font-semibold text-rose-300 text-xs">
                      {slipOkData.receivingBankName || slipOkData.receivingBank || '-'}
                    </span>
                  </div>
                  <div className="p-3 flex justify-between">
                    <span className="text-gray-400 text-xs">ผู้โอนเงิน:</span>
                    <span className="font-bold text-white text-xs">{slipOkData.sender?.displayName || '-'}</span>
                  </div>
                  <div className="p-3 flex justify-between">
                    <span className="text-gray-400 text-xs">ธนาคารผู้โอนเงิน:</span>
                    <span className="font-semibold text-sky-300 text-xs">
                      {slipOkData.sendingBankName || slipOkData.sendingBank || '-'}
                    </span>
                  </div>
                  <div className="p-3 flex justify-between">
                    <span className="text-gray-400 text-xs">วันที่โอนเงิน:</span>
                    <span className="font-mono text-white text-xs">{slipOkData.transDate || '-'}</span>
                  </div>
                  <div className="p-3 flex justify-between">
                    <span className="text-gray-400 text-xs">เวลาที่โอนเงิน:</span>
                    <span className="font-mono text-white text-xs">{slipOkData.transTime || '-'}</span>
                  </div>
                  <div className="p-3 flex justify-between items-center">
                    <span className="text-gray-400 text-xs">รหัสอ้างอิงธุรกรรม:</span>
                    <code className="text-xs bg-[#1a1b28] px-2 py-1 rounded text-amber-300 font-mono">
                      {slipOkData.transRef || '-'}
                    </code>
                  </div>
                </div>

                {/* Raw JSON Accordion */}
                <details className="bg-[#10111a] border border-gray-800 rounded-xl p-3 text-xs text-gray-400">
                  <summary className="cursor-pointer font-bold text-gray-300 hover:text-white">
                    ดูข้อมูลดิบ SlipOK (Raw JSON Data)
                  </summary>
                  <pre className="mt-3 p-2 bg-[#090a10] rounded text-[11px] text-green-400 overflow-x-auto max-h-60">
                    {JSON.stringify(slipOkData, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="bg-[#10111a] border border-dashed border-gray-800 rounded-xl p-8 text-center text-gray-500 text-xs">
                <div className="text-4xl mb-3 opacity-30">🔍</div>
                <div className="text-gray-400 font-semibold mb-1">ยังไม่มีผลการตรวจสอบ</div>
                <div>กรุณาเลือกรูปภาพสลิปแล้วกดปุ่ม "ตรวจสอบสลิป" เพื่อเรียกดูข้อมูลจาก SlipOK AI</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
