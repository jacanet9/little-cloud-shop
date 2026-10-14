import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('files');
    const customBranch = formData.get('branch_id') || process.env.SLIPOK_BRANCH_ID || '78528';
    const customKey = formData.get('api_key') || process.env.SLIPOK_API_KEY || 'SLIPOKRQF9YV8';
    const amount = formData.get('amount') || '';

    if (!file) {
      return NextResponse.json({ success: false, message: 'กรุณาแนบไฟล์รูปภาพสลิป' }, { status: 400 });
    }

    // Convert file to Buffer / Base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type || 'image/jpeg'};base64,${buffer.toString('base64')}`;

    // 1. Try calling Little Cloud Shop Backend Server (Port 3000)
    try {
      const littleCloudApiUrl = process.env.NEXT_PUBLIC_LITTLE_CLOUD_API || 'http://127.0.0.1:3000';
      const resp = await fetch(`${littleCloudApiUrl}/api/slip/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slip_data: base64,
          amount: amount ? Number(amount) : undefined,
          branch_id: customBranch,
          api_key: customKey
        }),
        cache: 'no-store'
      });

      const data = await resp.json();
      return NextResponse.json(data, { status: resp.status });
    } catch (backendErr) {
      console.warn('Little Cloud backend not reachable, falling back to direct SlipOK API:', backendErr.message);

      // 2. Direct Call to SlipOK API (Native fetch & FormData)
      const slipokForm = new FormData();
      const fileBlob = new Blob([buffer], { type: file.type || 'image/jpeg' });
      slipokForm.append('files', fileBlob, file.name || 'slip.jpg');
      if (amount) slipokForm.append('amount', String(amount));
      slipokForm.append('log', 'true');

      const slipokRes = await fetch(`https://api.slipok.com/api/line/apikey/${customBranch}`, {
        method: 'POST',
        headers: {
          'x-authorization': customKey
        },
        body: slipokForm
      });

      const slipokData = await slipokRes.json();
      if (!slipokRes.ok || !slipokData.success) {
        return NextResponse.json({
          success: false,
          code: slipokData.code || 'SLIPOK_ERROR',
          message: slipokData.message || 'การตรวจสอบสลิปกับ SlipOK ล้มเหลว'
        }, { status: slipokRes.status || 400 });
      }

      return NextResponse.json(slipokData);
    }

  } catch (err) {
    console.error('Error in /api/check-slip route:', err);
    return NextResponse.json({
      success: false,
      message: err.message || 'เกิดข้อผิดพลาดในการตรวจสอบสลิป'
    }, { status: 500 });
  }
}
