"use server";

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import TelnyxAPI from 'telnyx';

// Initialize Telnyx client
const telnyx = TelnyxAPI(process.env.TELNYX_API_KEY);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize conversation history
let conversationHistory = [];

// Function to manage conversation history
function updateConversationHistory(role, content) {
  conversationHistory.push({ role, content });
  // Keep only the last 10 messages to maintain context without excessive tokens
  if (conversationHistory.length > 10) {
    conversationHistory = conversationHistory.slice(-10);
  }
}

// Function to generate GPT response
async function generateGPTResponse(userMessage) {
  console.log('[ALBERT] Generating AI response for message:', userMessage);
  
  try {
    updateConversationHistory('user', userMessage);

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are Albert, a friendly and helpful AI assistant. Keep your responses concise, casual and engaging.',
        },
        ...conversationHistory,
      ],
    });

    const response = completion.choices[0].message.content;
    console.log('[ALBERT] Generated AI response:', response);
    
    updateConversationHistory('assistant', response);
    return response;
  } catch (error) {
    console.error('[ALBERT] Error generating GPT response:', error);
    return 'I apologize, but I am having trouble processing your message right now. Please try again later.';
  }
}

export async function POST(req) {
  console.log('[ALBERT] Webhook received at:', new Date().toISOString());
  
  try {
    const data = await req.json();
    console.log('[ALBERT] Received webhook payload:', JSON.stringify(data, null, 2));

    // Only process message.received events
    if (data.data?.event_type !== 'message.received') {
      console.log('[ALBERT] Ignoring non-message event:', data.data?.event_type);
      return NextResponse.json({ 
        message: 'Ignored non-message event' 
      }, { status: 200 });
    }

    // Extract the message text
    const messageText = data.data.payload.text;
    const fromNumber = data.data.payload.from.phone_number;

    console.log('[ALBERT] Processing incoming message:', {
      from: fromNumber,
      text: messageText,
      timestamp: new Date().toISOString()
    });

    if (!messageText) {
      console.log('[ALBERT] No message text provided');
      return NextResponse.json({ error: 'No message text provided' }, { status: 400 });
    }

    // Generate response using GPT
    const gptResponse = await generateGPTResponse(messageText);

    console.log('[ALBERT] Sending response via Telnyx:', {
      to: fromNumber,
      text: gptResponse,
      timestamp: new Date().toISOString()
    });

    // Send response using Telnyx
    const telnyxResponse = await telnyx.messages.create({
      from: process.env.TELNYX_NUMBER,
      to: fromNumber,
      text: gptResponse,
      messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID
    });

    console.log('[ALBERT] Successfully sent response:', {
      telnyxResponse,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Response sent successfully',
      response: telnyxResponse 
    }, { status: 200 });

  } catch (error) {
    console.error('[ALBERT] Error processing webhook:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return NextResponse.json({ 
      error: 'Failed to process webhook',
      details: error.message 
    }, { status: 500 });
  }
}

// Add OPTIONS handler for CORS preflight requests
export async function OPTIONS(req) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
} 