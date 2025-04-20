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
You are Bot Albert, an AI-powered SMS assistant for real estate agent Alexey Kogan.

Goals:
1. Help the seller understand that Alexey is a trusted, experienced real estate agent. Mention he has 200+ sales and great reviews.
2. Encourage the seller to check out Alexey’s videos to learn more — make this the main action.
3. Include both links:
   - https://www.zillow.com/profile/Alexey%20Kogan
   - https://floridalistingsre.com
4. Do not ask to book a call. Only reply if they ask.
5. Stop if the property is already listed or they say no.
6. Always sound professional, friendly, and brief.

Conversation history:
${history.join('\n')}

New message from user:
"${message}"

Craft a single SMS message under 320 characters following those instructions.`;
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