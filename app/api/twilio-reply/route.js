import { NextResponse } from 'next/server';
import { generateReplyWithGPT } from '@/lib/gpt';   // adjust if your helper lives elsewhere

let Telnyx;
async function initTelnyx() {
  if (!Telnyx) {
    const mod = await import('telnyx');
    Telnyx = mod.default(process.env.TELNYX_API_KEY);
  }
  return Telnyx;
}

export async function POST(req) {
  try {
    const payload  = await req.json();
    const from     = payload?.data?.payload?.from?.phone_number;
    const to       = payload?.data?.payload?.to?.[0]?.phone_number;
    const text     = payload?.data?.payload?.text;

    if (!from || !to || !text) {
      console.error('Missing fields', { from, to, text });
      return NextResponse.json({ ok:false }, { status:400 });
    }

    /* -------- AI reply -------- */
    const reply = await generateReplyWithGPT(text, from);

    /* -------- Send via Telnyx -------- */
    const telnyx = await initTelnyx();
    await telnyx.messages.create({
      from : process.env.TELNYX_NUMBER,
      to,
      text : reply,
      messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
    });

    console.log('✅ Bot Albert replied');
    return NextResponse.json({ ok:true });
  } catch (err) {
    console.error('Bot Albert error', err);
    return NextResponse.json({ ok:false }, { status:500 });
  }
} 