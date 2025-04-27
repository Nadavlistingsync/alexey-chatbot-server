let telnyx;
const initTelnyx = async () => {
  if (!telnyx) {
    const { default: Telnyx } = await import('telnyx');
    telnyx = Telnyx(process.env.TELNYX_API_KEY);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  await initTelnyx();             // ---- FIX: dynamic import

  const { from, to, message } = req.body;  // adjust to payload shape  
  try {
    await telnyx.messages.create({
      from: process.env.TELNYX_NUMBER,
      to,
      text: `Auto-reply: Alexey Kogan has 200+ sales…`,
      messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'send failed' });
  }
} 