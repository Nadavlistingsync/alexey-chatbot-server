import { NextResponse } from 'next/server';

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
    const message  = payload?.data?.payload?.text;

    if (!from || !to || !message) {
      console.error('Missing fields', { from, to, message });
      return NextResponse.json({ ok:false }, { status:400 });
    }

    /* -------- build GPT reply here -------- */
    // const reply = await generateReplyWithGPT(message, from);
    const reply = `Hi! Alexey here – thanks for reaching out about "${message}".`;

    /* -------- send via Telnyx -------- */
    const telnyx = await initTelnyx();
    await telnyx.messages.create({
      from : process.env.TELNYX_NUMBER,
      to,
      text : reply,
      messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
    });

    return NextResponse.json({ ok:true });
  } catch (err) {
    console.error('Bot Albert error', err);
    return NextResponse.json({ ok:false }, { status:500 });
  }
} 