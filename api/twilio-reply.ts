import type { Telnyx } from 'telnyx';
import type { OpenAI } from 'openai';

// Configuration
const CONFIG = {
  ALEXEY_IMAGE_URL: process.env.ALEXEY_IMAGE_URL || 'https://example.com/alexey.jpg', // You'll update this later
  MAX_HISTORY_LENGTH: 10,
  MAX_MESSAGE_LENGTH: 280,
} as const;

// Types
interface MessageHistory {
  messages: string[];
  hasSentImage: boolean;
}

interface TelnyxMessage {
  from: string;
  to: string;
  text: string;
  media_urls?: string[];
  messaging_profile_id: string;
}

// State
let telnyxClient: Telnyx | null = null;
let openaiClient: OpenAI | null = null;
const conversationHistory: Record<string, MessageHistory> = {};

// Initialize Telnyx client
const initTelnyx = async (): Promise<Telnyx> => {
  if (!telnyxClient) {
    const { default: TelnyxConstructor } = await import('telnyx');
    telnyxClient = TelnyxConstructor(process.env.TELNYX_API_KEY);
  }
  return telnyxClient;
};

// Initialize OpenAI client
const initOpenAI = async (): Promise<OpenAI> => {
  if (!openaiClient) {
    const { default: OpenAIConstructor } = await import('openai');
    openaiClient = new OpenAIConstructor({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
};

// Append to history and trim to last N entries
function appendHistory(from: string, role: string, text: string): void {
  if (!conversationHistory[from]) {
    conversationHistory[from] = { messages: [], hasSentImage: false };
  }
  
  conversationHistory[from].messages.push(`${role}: ${text}`);
  if (conversationHistory[from].messages.length > CONFIG.MAX_HISTORY_LENGTH) {
    conversationHistory[from].messages = conversationHistory[from].messages.slice(-CONFIG.MAX_HISTORY_LENGTH);
  }
}

// Build a GPT prompt including history and instructions
function buildPrompt(message: string, from: string): string {
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
function containsLink(text: string): boolean {
  const urlPattern = /https?:\/\/[^\s]+/;
  return urlPattern.test(text);
}

// Generate reply using GPT
async function generateReplyWithGPT(message: string, from: string): Promise<string> {
  const openai = await initOpenAI();
  try {
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

// Send message via Telnyx
async function sendMessage(message: TelnyxMessage): Promise<void> {
  const telnyx = await initTelnyx();
  await telnyx.messages.create(message);
}

export { generateReplyWithGPT, conversationHistory, appendHistory };

export default async function handler(req: any, res: any) {
  // Only process inbound texts
  if (req.method !== 'POST') return res.status(405).end();
  
  const evt = req.body.data?.event_type;
  console.log('Telnyx event_type:', evt);
  
  if (evt !== 'message.received') {
    console.log('⏩ skipping event_type:', evt);
    return res.status(200).end();
  }
  
  console.log('Incoming SMS payload:', JSON.stringify(req.body));
  
  try {
    const body = req.body;
    const message = ((body.data?.payload?.text || '').trim() || '').toLowerCase();
    const from = body.data?.payload?.from?.phone_number;
    const to = body.data?.payload?.to?.[0]?.phone_number;

    if (!from || !to || !message) {
      return res.status(400).json({ error: 'Missing required fields', from, to, message });
    }

    console.log('📩 Message received from:', from);
    console.log('📨 Message content:', message);

    // Append user message
    appendHistory(from, 'User', message);

    // Use a fixed Telnyx sender number from environment
    const senderNumber = process.env.TELNYX_NUMBER;

    console.log('🧠 Generating GPT reply...');
    const reply = await generateReplyWithGPT(message, from);
    console.log('✅ GPT reply:', reply);
    
    try {
      const messageData: TelnyxMessage = {
        from: senderNumber || to,
        to: from,
        text: reply,
        messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID || ''
      };

      // Check if we should send an image
      if (containsLink(reply) && !conversationHistory[from]?.hasSentImage) {
        messageData.media_urls = [CONFIG.ALEXEY_IMAGE_URL];
        conversationHistory[from].hasSentImage = true;
        console.log('📸 Sending MMS with image');
      }

      console.log('📤 Attempting to send message via Telnyx:', messageData);
      await sendMessage(messageData);
      appendHistory(from, 'Bot', reply);
    } catch (err) {
      console.error('❌ Telnyx send error:', err?.response?.data || err);
    }
    
    return res.status(200).json({ status: 'Message sent', reply });
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
