import { NextResponse } from 'next/server';

// Types
interface TelnyxWebhookPayload {
  data: {
    event_type: string;
    payload: {
      text: string;
      from: {
        phone_number: string;
      };
      to: Array<{
        phone_number: string;
      }>;
    };
  };
}

interface TelnyxMessage {
  from: string;
  to: string;
  text: string;
  media_urls?: string[];
  messaging_profile_id: string;
}

// Configuration
const CONFIG = {
  ALEXEY_IMAGE_URL: 'https://i.ibb.co/G3nk5LcK/Screenshot-2025-04-26-at-6-35-21-PM.png',
  MAX_MESSAGE_LENGTH: 280,
} as const;

// State
let telnyxClient: any = null;

// Initialize Telnyx client with caching
async function getTelnyxClient() {
  if (telnyxClient) {
    console.log('✅ Using cached Telnyx client');
    return telnyxClient;
  }

  try {
    const { default: Telnyx } = await import('telnyx');
    telnyxClient = new Telnyx(process.env.TELNYX_API_KEY);
    console.log('✅ Telnyx client initialized successfully');
    return telnyxClient;
  } catch (error) {
    console.error('❌ Failed to initialize Telnyx client:', error);
    telnyxClient = null;
    throw error;
  }
}

// Generate a simple reply (simulating GPT for now)
function generateReply(message: string): string {
  return `Hello! Alexey Kogan, a top agent in the area with 200+ sales and stellar reviews, can help you. Check out his profile here: https://www.zillow.com/profile/Alexey%20Kogan for more info. Feel free to reach out with any questions!`;
}

// Send message via Telnyx
async function sendMessage(message: TelnyxMessage): Promise<void> {
  const telnyx = await getTelnyxClient();
  try {
    console.log('📤 Sending message via Telnyx:', {
      to: message.to,
      hasImage: !!message.media_urls,
      textLength: message.text.length,
      mediaUrls: message.media_urls
    });
    
    await telnyx.messages.create(message);
    console.log('✅ Message sent successfully');
  } catch (err) {
    console.error('❌ Telnyx send error:', {
      error: err,
      response: err?.response?.data,
      message: err?.message,
      stack: err?.stack
    });
    throw err;
  }
}

export async function POST(request: Request) {
  console.log('📨 Received webhook request');
  
  try {
    const payload = await request.json() as TelnyxWebhookPayload;
    console.log('📦 Webhook payload:', JSON.stringify(payload, null, 2));

    if (!payload?.data?.event_type) {
      console.log('❌ Invalid payload structure');
      return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
    }

    if (payload.data.event_type !== 'message.received') {
      console.log('⏩ Skipping non-message event:', payload.data.event_type);
      return NextResponse.json({ success: true });
    }

    const message = (payload.data.payload.text || '').trim();
    const from = payload.data.payload.from?.phone_number;
    const to = payload.data.payload.to?.[0]?.phone_number;

    if (!from || !to || !message) {
      console.log('❌ Missing required fields:', { from, to, message });
      return NextResponse.json({ error: 'Missing required fields', from, to, message }, { status: 400 });
    }

    console.log('📩 Processing message:', { from, to, message });

    // Generate reply
    const reply = generateReply(message);
    console.log('✅ Generated reply:', reply);
    
    try {
      const messageData: TelnyxMessage = {
        from: process.env.TELNYX_NUMBER || to,
        to: from,
        text: reply,
        messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID || '',
        media_urls: [CONFIG.ALEXEY_IMAGE_URL] // Always include image for MMS
      };

      await sendMessage(messageData);
      
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error('❌ Failed to send message:', {
        error: err,
        response: err?.response?.data,
        message: err?.message,
        stack: err?.stack
      });
      return NextResponse.json({ 
        error: 'Failed to send message', 
        details: err?.response?.data || err 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('❌ Handler error:', {
      error,
      message: error?.message,
      stack: error?.stack
    });
    return NextResponse.json({ 
      error: error.message, 
      stack: error.stack 
    }, { status: 500 });
  }
} 