export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// You will need to set your OpenAI API key in the environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID;
const TELNYX_FROM_NUMBER = process.env.TELNYX_FROM_NUMBER;
const CONTACTS_PATH = path.resolve('./contacts.json');

// Helper to call OpenAI GPT
async function getGptResponse(userMessage) {
  const systemPrompt = `You are Bot Albert, a friendly SMS assistant for real estate agent Alexey Kogan.\n\nYour mission is simple:\n- Respond casually, like a real person texting. (Never robotic.)\n- When someone shows interest (positive words like "interested", "tell me more", "yes"), reply warmly and ask if they would like a free property analysis, or if they'd like to know about their local market value.\n- If someone says no, not interested, or is rude, politely say: "No worries! Feel free to reach out anytime." and end the conversation.\n- If someone asks a question about a property, answer briefly and offer to send a full info sheet.\n- Never schedule meetings, set prices, or make promises. Always offer to send more information instead.\n- Keep your messages short (1-2 sentences), natural, and easygoing — like texting a friend.\n- If unsure, always lean toward being polite and helpful rather than pushing.\n- Always include these two links with images (never send them alone): https://www.zillow.com/profile/Alexey%20Kogan and https://floridalistingsre.com`;

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    max_tokens: 200,
    temperature: 0.7
  };

  try {
    console.log('[GPT] Sending prompt to OpenAI:', userMessage);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log('[GPT] OpenAI response:', data);
    return data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
  } catch (err) {
    console.error('[GPT] Error calling OpenAI:', err);
    return 'Sorry, there was an error generating a response.';
  }
}

// Helper to send SMS via Telnyx
async function sendSms(to, message) {
  const payload = {
    from: TELNYX_FROM_NUMBER,
    to,
    text: message,
    messaging_profile_id: TELNYX_MESSAGING_PROFILE_ID,
  };

  try {
    console.log('[Telnyx SMS] Sending SMS:', payload);
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    console.log('[Telnyx SMS] Outbound SMS response:', data);
    return data;
  } catch (err) {
    console.error('[Telnyx SMS] Error sending SMS:', err);
    return null;
  }
}

// In-memory log for demo (replace with DB in production)
const conversationLog = [];

export async function POST(req) {
  try {
    const body = await req.json();
    console.log('[Webhook] Incoming payload:', JSON.stringify(body));
    const userMessage = body.data?.payload?.text || '';
    const fromNumber = body.data?.payload?.from?.phone_number || body.data?.payload?.from || '';

    // STOP keyword handling
    if (/\bstop\b/i.test(userMessage) && fromNumber) {
      let contacts = [];
      try {
        contacts = JSON.parse(fs.readFileSync(CONTACTS_PATH, 'utf-8'));
      } catch (err) {
        contacts = [];
      }
      const filtered = contacts.filter(c => c.phone !== fromNumber);
      fs.writeFileSync(CONTACTS_PATH, JSON.stringify(filtered, null, 2));
      await sendSms(fromNumber, 'You have been unsubscribed. Have a great day!');
      return NextResponse.json({ reply: 'You have been unsubscribed. Have a great day!', timestamp: new Date().toISOString() });
    }

    // Always send GPT reply for every inbound message (except STOP)
    const gptResponse = await getGptResponse(userMessage);
    conversationLog.push({ from: fromNumber, message: userMessage, response: gptResponse, timestamp: new Date().toISOString() });
    console.log('[Webhook] GPT response:', gptResponse);
    if (fromNumber && gptResponse) {
      await sendSms(fromNumber, gptResponse);
    }

    // Only add to contacts.json if not present (for follow-up scheduling)
    if (fromNumber) {
      let contacts = [];
      try {
        contacts = JSON.parse(fs.readFileSync(CONTACTS_PATH, 'utf-8'));
      } catch (err) {
        contacts = [];
      }
      const exists = contacts.some(c => c.phone === fromNumber);
      if (!exists) {
        contacts.push({ phone: fromNumber, followUpCount: 0, lastFollowUpDate: null, status: 'pending' });
        fs.writeFileSync(CONTACTS_PATH, JSON.stringify(contacts, null, 2));
        console.log(`[FollowUp] Added new contact for follow-ups: ${fromNumber}`);
      }
    }

    return NextResponse.json({ reply: gptResponse, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Webhook] Error in handler:', err);
    return NextResponse.json({ error: 'Internal server error', details: err?.message }, { status: 500 });
  }
} 