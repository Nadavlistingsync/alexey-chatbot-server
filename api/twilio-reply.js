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
Use a relaxed, friendly tone, share credibility, gauge interest in selling without hard-selling, and ask permission to follow up.
If the property is already listed, do not reply.
If user says no or negative, reply politely and stop.
If user says yes or positive, follow a two-step flow: first ask if you can contact them, then hand off to Alexey.
Conversation history:
${history.join('\n')}

New message:
User: "${message}"

Respond with a single SMS reply.`;
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

    // Append user message
    appendHistory(from, 'User', message);

    // GPT handles all logic
    const reply = await generateReplyWithGPT(message, from);
    try {
      await telnyx.messages.create({
        from: to,
        to: from,
        text: reply,
        messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID
      });
      appendHistory(from, 'Bot', reply);
    } catch (err) {
      console.error('Telnyx send error (GPT):', err);
    }
    
    return res.status(200).json({ status: 'Message sent', reply });
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}