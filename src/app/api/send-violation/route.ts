import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email, contentType, contentTitle } = await request.json()

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
        subject: `${contentType} removed: Potential policy violation`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:520px;margin:40px auto;background:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;"><div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:32px;text-align:center;"><div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;"><span style="color:white;font-size:28px;font-weight:900;">⚠</span></div><h1 style="color:white;font-size:22px;font-weight:700;margin:0;">${contentType} Removed</h1></div><div style="padding:32px;"><p style="color:#e4e4e7;font-size:16px;margin:0 0 16px;">Your ${contentType.toLowerCase()} <strong>"${contentTitle}"</strong> has been removed from NANOTOON.</p><p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;"><strong>Reason:</strong> Potential policy violation.</p><p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;">Our team has reviewed this content and determined it may violate our community guidelines or terms of service.</p><p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 28px;">If you believe this was a mistake, please contact us at <a href="mailto:nanotooncontact@gmail.com" style="color:#c084fc;">nanotooncontact@gmail.com</a>.</p><hr style="border:none;border-top:1px solid #27272a;margin:0 0 20px;"><p style="color:#52525b;font-size:12px;margin:0;text-align:center;">© 2025 NANOTOON. All rights reserved.</p></div></div></body></html>`,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ ok: false, error: body }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
