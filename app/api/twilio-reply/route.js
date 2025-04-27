import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

let Telnyx;
const initModules = async () => {
  console.log('[ALBERT] Initializing Telnyx module...');
  try {
    if (!Telnyx) {
      const telnyxImport = await import("telnyx");
      Telnyx = telnyxImport.default;
      console.log('[ALBERT] Telnyx module initialized successfully');
    }
  } catch (error) {
    console.error('[ALBERT] Failed to initialize Telnyx module:', error);
    throw error;
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
  console.log(`[ALBERT] Updated conversation history for ${from}:`, conversationHistory[from]);
}

// Build a GPT prompt including history and instructions
function buildPrompt(message, from) {
  const history = conversationHistory[from] || [];
  return `You are Bot Albert, an SMS assistant for real estate agent Alexey Kogan.
Use a relaxed, friendly tone, share credibility, gauge interest in selling without hard-selling, and ask permission to follow up.
If the property is already listed, do not reply.
If user says no or negative, reply politely and stop.
If user says yes or positive, follow a two-step flow: first ask if you can contact them, then hand off to Alexey.
Conversation history:
${history.join("\n")}

New message:
User: "${message}"

Respond with a single SMS reply.`;
}

// --- Lazy‑load OpenAI SDK (works both locally and on Vercel) ---
let OpenAI;
let openaiClient;

const initOpenAI = async () => {
  console.log('[ALBERT] Initializing OpenAI client...');
  try {
    if (!OpenAI) {
      const { default: OpenAIConstructor } = await import("openai");
      OpenAI = OpenAIConstructor;
      openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Guard – fail fast if the SDK isn't what we expect
      if (!openaiClient.chat?.completions?.create) {
        throw new Error(
          "OpenAI client initialisation failed – `chat.completions.create` is unavailable"
        );
      }
      console.log('[ALBERT] OpenAI client initialized successfully');
    }
  } catch (error) {
    console.error('[ALBERT] Failed to initialize OpenAI client:', error);
    throw error;
  }
};

async function generateReplyWithGPT(message, from) {
  console.log(`[ALBERT] Generating GPT response for message from ${from}:`, message);
  await initOpenAI();
  try {
    const prompt = buildPrompt(message, from);
    console.log('[ALBERT] Generated prompt:', prompt);

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are the SMS assistant Bot Albert." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7
    });

    const response = completion.choices[0].message.content.trim();
    console.log('[ALBERT] Generated GPT response:', response);
    return response;
  } catch (err) {
    console.error('[ALBERT] GPT fallback error:', err);
    return "Sorry, I had trouble generating a response. Can you please rephrase that?";
  }
}

export async function POST(req) {
  console.log('[ALBERT] Webhook received at:', new Date().toISOString());
  
  try {
    const body = await req.json();
    console.log('[ALBERT] Received webhook payload:', JSON.stringify(body, null, 2));

    const message = ((body.data?.payload?.text || "").trim() || "").toLowerCase();
    const from = body.data?.payload?.from?.phone_number;
    const to = body.data?.payload?.to?.[0]?.phone_number;

    console.log('[ALBERT] Extracted message details:', {
      from,
      to,
      message,
      timestamp: new Date().toISOString()
    });

    if (!from || !to || !message) {
      console.error('[ALBERT] Missing required fields:', { from, to, message });
      return NextResponse.json(
        { error: "Missing required fields", from, to, message },
        { status: 400 }
      );
    }

    // Append user message
    appendHistory(from, "User", message);

    // GPT handles all logic
    const reply = await generateReplyWithGPT(message, from);
    
    try {
      console.log('[ALBERT] Initializing Telnyx client...');
      await initModules();
      const telnyx = Telnyx(process.env.TELNYX_API_KEY);
      
      console.log('[ALBERT] Sending response via Telnyx:', {
        from: to,
        to: from,
        text: reply,
        messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID
      });

      const telnyxResponse = await telnyx.messages.create({
        from: to,
        to: from,
        text: reply,
        messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID
      });

      console.log('[ALBERT] Successfully sent Telnyx message:', {
        response: telnyxResponse,
        timestamp: new Date().toISOString()
      });

      appendHistory(from, "Bot", reply);
    } catch (err) {
      console.error('[ALBERT] Telnyx send error:', {
        error: err.message,
        stack: err.stack,
        payload: {
          from: to,
          to: from,
          text: reply,
          messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID
        }
      });
    }
    
    return NextResponse.json({ status: "Message sent", reply });
  } catch (error) {
    console.error('[ALBERT] Handler error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
