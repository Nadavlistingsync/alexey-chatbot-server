let telnyx;
const initTelnyx = async () => {
  if (!telnyx) {
    const { default: Telnyx } = await import('telnyx');
    telnyx = Telnyx(process.env.TELNYX_API_KEY);
  }
  return telnyx;
};

export default async function handler(req, res) {
  console.log('📨 Received webhook request');
  
  if (req.method !== 'POST') {
    console.log('❌ Invalid method:', req.method);
    return res.status(405).end();
  }

  try {
    const payload = req.body;
    console.log('📦 Webhook payload:', JSON.stringify(payload, null, 2));

    if (!payload?.data?.event_type) {
      console.log('❌ Invalid payload structure');
      return res.status(400).json({ error: 'Invalid payload structure' });
    }

    if (payload.data.event_type !== 'message.received') {
      console.log('⏩ Skipping non-message event:', payload.data.event_type);
      return res.status(200).end();
    }

    const message = (payload.data.payload.text || '').trim();
    const from = payload.data.payload.from?.phone_number;
    const to = payload.data.payload.to?.[0]?.phone_number;

    if (!from || !to || !message) {
      console.log('❌ Missing required fields:', { from, to, message });
      return res.status(400).json({ error: 'Missing required fields', from, to, message });
    }

    console.log('📩 Processing message:', { from, to, message });

    // Initialize Telnyx client
    const telnyx = await initTelnyx();

    // Send reply
    await telnyx.messages.create({
      from: process.env.TELNYX_NUMBER,
      to: from,
      text: `Hello! Alexey Kogan, a top agent in the area with 200+ sales and stellar reviews, can help you. Check out his profile here: https://www.zillow.com/profile/Alexey%20Kogan for more info. Feel free to reach out with any questions!`,
      messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
      media_urls: ['https://i.ibb.co/G3nk5LcK/Screenshot-2025-04-26-at-6-35-21-PM.png']
    });
    
    console.log('✅ Message sent successfully');
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Handler error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error'
    });
  }
} 