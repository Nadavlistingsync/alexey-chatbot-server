export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { Configuration, OpenAIApi } from 'openai';
import { telnyx } from '@telnyx/webrtc';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

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
  try {
    updateConversationHistory('user', userMessage);

    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are Albert, a friendly and helpful AI assistant. Keep your responses concise and engaging.',
        },
        ...conversationHistory,
      ],
    });

    const response = completion.data.choices[0].message.content;
    updateConversationHistory('assistant', response);
    return response;
  } catch (error) {
    console.error('Error generating GPT response:', error);
    return 'I apologize, but I am having trouble processing your message right now. Please try again later.';
  }
}

export async function POST(req) {
  try {
    const data = await req.json();
    console.log('Received webhook:', JSON.stringify(data, null, 2));

    // Extract the message text
    const messageText = data.text;
    const fromNumber = data.from.phone_number;
    const toNumber = data.to[0].phone_number;

    if (!messageText) {
      return NextResponse.json({ error: 'No message text provided' }, { status: 400 });
    }

    // Generate response using GPT
    const gptResponse = await generateGPTResponse(messageText);

    // Send response using Telnyx
    const telnyxResponse = await telnyx.messages.create({
      from: toNumber,  // The number that received the original message
      to: fromNumber,  // The number that sent the original message
      text: gptResponse,
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Response sent successfully',
      response: telnyxResponse 
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
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