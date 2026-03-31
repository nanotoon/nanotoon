import { NextResponse } from 'next/server'


export async function POST(request: Request) {
  try {
    const { email, displayName } = await request.json()

    // If no Resend API key is set, skip silently (email still works via Supabase)
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'NANOTOON <noreply@nanotoon.io>',
        to: email,
        subject: 'Welcome to NANOTOON! 🎉',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#7c3aed,#c026d3);padding:32px;text-align:center;">
      <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
        <span style="color:white;font-size:28px;font-weight:900;">N</span>
      </div>
      <h1 style="color:white;font-size:24px;font-weight:700;margin:0;">Welcome to NANOTOON!</h1>
    </div>
    <div style="padding:32px;">
      <p style="color:#e4e4e7;font-size:16px;margin:0 0 16px;">Hi <strong>${displayName}</strong>,</p>
      <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Welcome to the community! This is a platform built specifically for AI comic, manga, and webtoon creators.
      </p>
      <p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 28px;">
        Get your series live and into the hands of readers by uploading your first chapter, or start supporting your favorite AI comic, manga, and webtoon creators today.
      </p>
      <div style="text-align:center;margin-bottom:28px;">
        <a href="https://nanotoon.io" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#c026d3);color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:15px;">
          Start Exploring →
        </a>
      </div>
      <hr style="border:none;border-top:1px solid #27272a;margin:0 0 20px;">
      <p style="color:#52525b;font-size:12px;margin:0;text-align:center;">
        You're receiving this because you signed up at nanotoon.io<br>
        © 2025 NANOTOON. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
        `.trim(),
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('Resend error:', body)
      return NextResponse.json({ ok: false, error: body }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('send-welcome error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
