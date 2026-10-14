import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('files');
    const customBranch = formData.get('branch_id') || process.env.SLIPOK_BRANCH_ID || '77061';
    const customKey = formData.get('api_key') || process.env.SLIPOK_API_KEY || 'SLIPOKM1QT19D';
    const amount = formData.get('amount') || '';

    if (!file) {
      return NextResponse.json({ success: false, message: 'กรุณาแนบไฟล์รูปภาพสลิป' }, { status: 400 });
    }

    // Convert file to Buffer / Base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type || 'image/jpeg'};base64,${buffer.toString('base64')}`;

    // Forward to Little Cloud Shop Backend Server (Port 3000) or SlipOK directly
    try {
      const resp = await fetch('http://127.0.0.1:3000/api/slip/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slip_data: base64,
          amount: amount ? Number(amount) : undefined,
          branch_id: customBranch,
          api_key: customKey
        })
      });

      const data = await resp.json();
      return NextResponse.json(data, { status: resp.status });
    } catch (backendErr) {
      // Fallback: Direct call to SlipOK API
      const FormDataNode = (await import('form-data')).default;
      const axios = (await import('axios')).default;
      const form = new FormDataNode();
      form.append('files', buffer, { filename: file.name || 'slip.jpg', contentType: file.type || 'image/jpeg' });
      if (amount) form.append('amount', Number(amount));
      form.append('log', 'true');

      const slipokRes = await axios.post(`https://api.slipok.com/api/line/apikey/${customBranch}`, form, {
        headers: {
          ...form.getHeaders(),
          'x-authorization': customKey
        }
      });

      return NextResponse.json(slipokRes.data);
    }

  } catch (err) {
    const errData = err.response?.data;
    return NextResponse.json({
      success: false,
      code: errData?.code,
      message: errData?.message || err.message
    }, { status: 400 });
  }
}
