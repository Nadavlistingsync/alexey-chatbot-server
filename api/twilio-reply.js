let Telnyx;
const initModules = async () => {
  if (!Telnyx) {
    const telnyxImport = await import('telnyx');
    Telnyx = telnyxImport.default;
  }
};

const conversationHistory = {};

// Append to history and trim to last 10 entries
function appendHistory(from, role, text) {
  if (!conversationHistory[from]) conversationHistory[from] = [];
  conversationHistory[from].push(`${role}: ${text}`);
  if (conversationHistory[from].length > 10) {
    conversationHistory[from] = conversationHistory[from].slice(-10);
  }
}

// Build a GPT prompt including history and instructions
function buildPrompt(message, from) {
  const history = conversationHistory[from] || [];
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
7. All messages must be brief (under 280 characters), polite, and professional.
8. Do not repeat the same facts (like "200+ sales" or the Zillow link) in every message. Vary your pitch with different angles such as success stories, awards, professionalism, or a soft reminder.

Conversation history:
${history.join('\n')}

New message from user:
"${message}"

Craft a single SMS message under 280 characters based on the goals above.`;
}

// --- Lazy‑load OpenAI SDK (works both locally and on Vercel) ---
let OpenAI;
let openaiClient;

const initOpenAI = async () => {
  if (!OpenAI) {
    const { default: OpenAIConstructor } = await import('openai');
    OpenAI = OpenAIConstructor;
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Guard – fail fast if the SDK isn’t what we expect
    if (!openaiClient.chat?.completions?.create) {
      throw new Error(
        'OpenAI client initialisation failed – `chat.completions.create` is unavailable',
      );
    }
  }
};

async function generateReplyWithGPT(message, from) {
  await initOpenAI();
  try {
    const prompt = buildPrompt(message, from);

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are the SMS assistant Bot Albert." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    });

    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('GPT fallback error:', err);
    return "Sorry, I had trouble generating a response. Can you please rephrase that?";
  }
}

export { generateReplyWithGPT, conversationHistory, appendHistory };

export default async function handler(req, res) {
  // Only process inbound texts
  if (req.method !== 'POST') return res.status(405).end();
  const evt = req.body.data?.event_type;
  console.log('Telnyx event_type:', evt);
  if (evt !== 'message.received') {
    // ignore non-inbound events
    console.log('⏩ skipping event_type:', evt);
    return res.status(200).end();
  }
  console.log('Incoming SMS payload:', JSON.stringify(req.body));
  
  await initModules();
  const telnyx = Telnyx(process.env.TELNYX_API_KEY);
  
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
    // GPT handles all logic
    const reply = await generateReplyWithGPT(message, from);
    console.log('✅ GPT reply:', reply);
    
    try {
      console.log('📤 Attempting to send SMS via Telnyx with:', {
        from: senderNumber || to,
        to: from,
        text: reply,
        messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID
      });
      await telnyx.messages.create({
        from: senderNumber || to,
        to: from,
        text: reply,
        messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID
      });
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