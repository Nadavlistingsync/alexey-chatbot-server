export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

// You will need to set your OpenAI API key in the environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Helper to call OpenAI GPT
async function getGptResponse(userMessage) {
  const systemPrompt = `You are Alexey, a relaxed and friendly real estate expert. Your goals are:
1. Make sure the seller knows everything about you and encourage them to watch your videos.
2. Find out if they are interested in selling their property for a reasonable price, based on recently sold comparable properties. If yes, ask if it's OK to reach out to them (no need to book an appointment).
3. If the answer is negative (wrong number, sold, not selling, off market, not my property, lived there 10 years ago, take me off your list, how did you get my number, I'm a realtor, broker owner, my wife is the listing agent), politely move on.
4. If the answer is 'currently listed', do not reply and log for manual review.
5. If the answer is positive (yes, still want to sell, available, bring a buyer, send me an offer, do you want to buy it, how much can I get, sure), keep it casual and friendly, and try to move the conversation forward.
Always use a relaxed and friendly tone. Every message must be a GPT response, not a set reply.`;

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

// In-memory log for demo (replace with DB in production)
const conversationLog = [];

export async function POST(req) {
  try {
    const body = await req.json();
    console.log('[Webhook] Incoming payload:', JSON.stringify(body));
    const userMessage = body.data?.payload?.text || '';
    const fromNumber = body.data?.payload?.from || '';

    // Check for 'currently listed' (manual review)
    if (/currently listed/i.test(userMessage)) {
      console.log('[Webhook] Message flagged for manual review:', userMessage);
      conversationLog.push({ from: fromNumber, message: userMessage, response: null, manual: true, timestamp: new Date().toISOString() });
      return NextResponse.json({ message: 'Message logged for manual review.', manual: true });
    }

    // Generate GPT response
    const gptResponse = await getGptResponse(userMessage);
    conversationLog.push({ from: fromNumber, message: userMessage, response: gptResponse, timestamp: new Date().toISOString() });
    console.log('[Webhook] GPT response:', gptResponse);

    return NextResponse.json({ reply: gptResponse, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Webhook] Error in handler:', err);
    return NextResponse.json({ error: 'Internal server error', details: err?.message }, { status: 500 });
  }
} 