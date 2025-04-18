import Telnyx from 'telnyx';
import OpenAI from 'openai';
 

const telnyx = Telnyx(process.env.TELNYX_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// In-memory conversation history store
const conversationHistory = {};

// Utility keyword checks
const negativePatterns = [
  "wrong number","sold","not selling","off market","not my property",
  "lived there","take me off","remove me","not interested","stop","go away"
];
const positivePatterns = [
  "yes","sure","ok","sounds good","interested","go ahead","please do"
];
const listedPatterns = [
  "it's currently listed","it is currently listed","property is listed",
  "already listed","we have it listed","i have it listed","on the market"
];

function isNegative(message) {
  return negativePatterns.some(p => message.includes(p));
}
function isPositive(message) {
  return positivePatterns.some(p => message.includes(p));
}
function isListed(message) {
  return listedPatterns.some(p => message.includes(p));
}

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

async function generateReplyWithGPT(message, from) {
  const prompt = buildPrompt(message, from);
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "You are the SMS assistant Bot Albert." },
      { role: "user", content: prompt }
    ],
    temperature: 0.7
  });
  return completion.choices[0].message.content.trim();
}

export default async function handler(req, res) {
  try {
    const body = req.body;
    // Support both Telnyx and Twilio incoming shapes
    const message = ((body.text || body.Body) || '').trim().toLowerCase();
    const from = body.from?.phone_number || body.From;
    const to = Array.isArray(body.to) ? body.to[0].phone_number : body.To;

    if (!from || !message) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Append user message
    appendHistory(from, 'User', message);

    // Keyword-based early exits
    if (isListed(message)) {
      return res.status(200).json({ status: 'Flagged as listed - no reply' });
    }
    if (isNegative(message)) {
      const reply = "I understand. Thanks for letting me know. I'll update our records. Have a great day!";
      try {
        await telnyx.messages.create({ from: to, to: from, text: reply });
        appendHistory(from, 'Bot', reply);
      } catch (err) {
        console.error('Telnyx send error (negative):', err);
      }
      return res.status(200).json({ status: 'Message sent', reply });
    }
    if (isPositive(message)) {
      // Two-step staging via history count
      const stageCount = conversationHistory[from].filter(line => line.startsWith('Bot:')).length;
      let reply;
      if (stageCount === 0) {
        reply = `Great to hear that! Alexey Kogan specializes in this area and has sold several properties nearby. May I share more details or have him contact you?`;
      } else {
        reply = `Perfect! I'll inform Alexey to reach out to you personally within 24 hours. Thanks for your time!`;
      }
      try {
        await telnyx.messages.create({ from: to, to: from, text: reply });
        appendHistory(from, 'Bot', reply);
      } catch (err) {
        console.error('Telnyx send error (positive):', err);
      }
      return res.status(200).json({ status: 'Message sent', reply });
    }

    // GPT fallback
    const reply = await generateReplyWithGPT(message, from);
    try {
      await telnyx.messages.create({ from: to, to: from, text: reply });
      appendHistory(from, 'Bot', reply);
    } catch (err) {
      console.error('Telnyx send error (fallback):', err);
    }
    
    return res.status(200).json({ status: 'Message sent', reply });
  } catch (error) {
    console.error('Handler error:', error);
    // Return actual error details for debugging
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}

export const config = {
  runtime: 'nodejs',
  maxDuration: 10, // optional: allows more time for async work
};