import { NextResponse } from 'next/server';

// Next.js configuration
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

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

// Configuration
const CONFIG = {
  ALEXEY_IMAGE_URL: 'https://i.ibb.co/G3nk5LcK/Screenshot-2025-04-26-at-6-35-21-PM.png',
} as const;

// Environment variable validation
function validateEnv() {
  const requiredEnvVars = [
    'TELNYX_API_KEY',
    'TELNYX_NUMBER',
    'TELNYX_MESSAGING_PROFILE_ID'
  ];

  const missing = requiredEnvVars.filter(env => !process.env[env]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Telnyx client caching
let telnyx;
const initTelnyx = async () => {
  if (!telnyx) {
    try {
      console.log('🔑 Initializing Telnyx client...');
      const telnyxImport = await import('telnyx');
      telnyx = telnyxImport.default(process.env.TELNYX_API_KEY);
      console.log('✅ Telnyx client initialized');
      return telnyx;
    } catch (error) {
      console.error('❌ Telnyx initialization error:', error);
      throw new Error('Failed to initialize Telnyx client');
    }
  }
  return telnyx;
};

// Generate a simple reply (simulating GPT for now)
function generateReply(message: string): string {
  return `Hello! Alexey Kogan, a top agent in the area with 200+ sales and stellar reviews, can help you. Check out his profile here: https://www.zillow.com/profile/Alexey%20Kogan for more info. Feel free to reach out with any questions!`;
}

export async function POST(request: Request) {
  console.log('📨 Received webhook request');
  
  try {
    // Validate environment variables
    validateEnv();
    
    // Parse request body
    const payload = await request.json() as TelnyxWebhookPayload;
    console.log('📦 Webhook payload:', JSON.stringify(payload, null, 2));

    // Validate payload structure
    if (!payload?.data?.event_type) {
      console.log('❌ Invalid payload structure');
      return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
    }

    // Only process message.received events
    if (payload.data.event_type !== 'message.received') {
      console.log('⏩ Skipping non-message event:', payload.data.event_type);
      return NextResponse.json({ success: true });
    }

    // Extract message data
    const message = (payload.data.payload.text || '').trim();
    const from = payload.data.payload.from?.phone_number;
    const to = payload.data.payload.to?.[0]?.phone_number;

    // Validate required fields
    if (!from || !to || !message) {
      console.log('❌ Missing required fields:', { from, to, message });
      return NextResponse.json({ error: 'Missing required fields', from, to, message }, { status: 400 });
    }

    console.log('📩 Processing message:', { from, to, message });

    // Generate reply
    const reply = generateReply(message);
    console.log('✅ Generated reply:', reply);
    
    try {
      // Initialize Telnyx client
      const telnyx = await initTelnyx();

      // Prepare message data
      const messageData = {
        from: process.env.TELNYX_NUMBER,
        to: from,
        text: reply,
        messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
        media_urls: [CONFIG.ALEXEY_IMAGE_URL]
      };

      console.log('📤 Sending message:', {
        to: from,
        from: process.env.TELNYX_NUMBER,
        hasImage: true
      });

      // Send MMS
      await telnyx.messages.create(messageData);
      
      console.log('✅ Message sent successfully');
      return NextResponse.json({ 
        success: true,
        message: 'Reply sent successfully',
        to: from,
        from: process.env.TELNYX_NUMBER
      });
    } catch (err) {
      console.error('❌ Failed to send message:', {
        error: err,
        message: err?.message,
        stack: err?.stack
      });
      return NextResponse.json({ 
        error: 'Failed to send message', 
        details: err?.message || 'Unknown error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('❌ Handler error:', {
      error,
      message: error?.message,
      stack: error?.stack
    });
    return NextResponse.json({ 
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
} 