// Configuration
const CONFIG = {
  ALEXEY_IMAGE_URL: 'https://i.ibb.co/G3nk5LcK/Screenshot-2025-04-26-at-6-35-21-PM.png',
  MAX_HISTORY_LENGTH: 10,
  MAX_MESSAGE_LENGTH: 280,
};

// Types
const MessageHistory = {
  messages: [],
  hasSentImage: false,
};

// State
const conversationHistory = {};

// Telnyx client caching with proper ESM imports
let telnyxClient = null;
const initTelnyx = async () => {
  if (!telnyxClient) {
    try {
      console.log('🔑 Initializing Telnyx client...');
      const telnyxModule = await import('telnyx');
      telnyxClient = telnyxModule.default(process.env.TELNYX_API_KEY);
      console.log('✅ Telnyx client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Telnyx client:', error);
      throw new Error('Failed to initialize Telnyx client');
    }
  }
  return telnyxClient;
};

// Append to history and trim to last N entries
function appendHistory(from, role, text) {
  if (!conversationHistory[from]) {
    conversationHistory[from] = { ...MessageHistory };
  }
  
  conversationHistory[from].messages.push(`${role}: ${text}`);
  if (conversationHistory[from].messages.length > CONFIG.MAX_HISTORY_LENGTH) {
    conversationHistory[from].messages = conversationHistory[from].messages.slice(-CONFIG.MAX_HISTORY_LENGTH);
  }
}

// Build a GPT prompt including history and instructions
function buildPrompt(message, from) {
  const history = conversationHistory[from]?.messages || [];
  return `
You are Bot Albert, an SMS assistant for real estate agent Alexey Kogan.

Goals:
1. Convince the seller that Alexey is one of the top agents in the area. Mention he has 200+ sales and stellar reviews.
2. Your MAIN GOAL is to get them to watch Alexey's videos or visit his website to learn more.
3. Rotate message tone to sound natural, helpful, and human — like a friendly assistant who respects their time.
4. Send one link per message. You can start with either:
   - https://www.zillow.com/profile/Alexey%20Kogan
Choose based on what feels more relevant in context.
5. NEVER ask to book a call unless they bring it up.
6. If the property is already listed or they say no, stop messaging.
7. All messages must be brief (under ${CONFIG.MAX_MESSAGE_LENGTH} characters), polite, and professional.
8. Do not repeat the same facts (like "200+ sales" or the Zillow link) in every message. Vary your pitch with different angles such as success stories, awards, professionalism, or a soft reminder.

Conversation history:
${history.join('\n')}

New message from user:
"${message}"

Craft a single SMS message under ${CONFIG.MAX_MESSAGE_LENGTH} characters based on the goals above.`;
}

// Check if message contains a link
function containsLink(text) {
  const urlPattern = /https?:\/\/[^\s]+/;
  return urlPattern.test(text);
}

// Generate reply using GPT
async function generateReplyWithGPT(message, from) {
  try {
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const prompt = buildPrompt(message, from);
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are the SMS assistant Bot Albert." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    });

    return completion.choices[0].message.content?.trim() || "Sorry, I had trouble generating a response.";
  } catch (err) {
    console.error('GPT fallback error:', err);
    return "Sorry, I had trouble generating a response. Can you please rephrase that?";
  }
}

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

    // Append user message to history
    appendHistory(from, 'User', message);

    // Generate GPT reply
    console.log('🧠 Generating GPT reply...');
    const reply = await generateReplyWithGPT(message, from);
    console.log('✅ GPT reply:', reply);

    // Initialize Telnyx client
    const telnyx = await initTelnyx();

    // Prepare message data
    const messageData = {
      from: process.env.TELNYX_NUMBER,
      to: from,
      text: reply,
      messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID
    };

    // Add image if reply contains a link
    if (containsLink(reply)) {
      messageData.media_urls = [CONFIG.ALEXEY_IMAGE_URL];
      console.log('📸 Sending MMS with image');
    }

    // Send reply
    await telnyx.messages.create(messageData);
    
    // Append bot reply to history
    appendHistory(from, 'Bot', reply);
    
    console.log('✅ Message sent successfully');
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Handler error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error'
    });
  }
} 