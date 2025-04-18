import Telnyx from 'telnyx';

const telnyx = Telnyx(process.env.TELNYX_API_KEY);

/**
 * Bot Albert SMS Assistant Logic
 * This represents the core decision-making logic for Bot Albert,
 * an SMS assistant for Florida Listings Real Estate.
 */

const AGENT_INFO = {
  name: "Alexey Kogan",
  company: "Florida Listings Real Estate",
  website: "https://floridalistingsre.com",
  zillow: "https://zillow.com/profile/Alexey%20Kogan"
};

const conversationHistory = {};

function isCurrentlyListed(message) {
  const listedPatterns = [
    "it's currently listed",
    "it is currently listed",
    "property is listed",
    "already listed",
    "we have it listed",
    "i have it listed",
    "on the market"
  ];
  return listedPatterns.some(pattern => message.includes(pattern));
}

function isNegativeResponse(message) {
  const negativePatterns = [
    "wrong number",
    "sold",
    "not selling",
    "off market",
    "not my property",
    "lived there",
    "take me off",
    "remove me",
    "not interested",
    "stop",
    "go away"
  ];
  return negativePatterns.some(pattern => message.includes(pattern));
}

function isPositiveResponse(message) {
  const positivePatterns = [
    "yes",
    "sure",
    "ok",
    "sounds good",
    "interested",
    "go ahead",
    "please do"
  ];
  return positivePatterns.some(pattern => message.includes(pattern));
}

function generateReply(message) {
  const lowerMessage = message.toLowerCase();

  if (isNegativeResponse(lowerMessage)) {
    return "No problem at all. You won’t hear from me again. Have a great day!";
  }

  if (isCurrentlyListed(lowerMessage)) {
    return "Thanks for the update! I’ll make a note not to follow up again.";
  }

  if (isPositiveResponse(lowerMessage)) {
    return `Awesome. Alexey Kogan has helped dozens of sellers near you. Check out his work here: ${AGENT_INFO.website}. He’ll take a look at recent sales and let you know what you could get. Is it okay if he follows up with you personally?`;
  }

  return `Hey there! Just reaching out to see if you’re still open to selling your property. If not, no worries — just reply “stop” and I won’t follow up.`;
}

export async function POST(req) {
  try {
    const body = await req.json();

    const from = body.from.phone_number;
    const message = body.text;
    const to = body.to[0].phone_number;

    if (!from || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
      });
    }

    const reply = generateReply(message);

    await telnyx.messages.create({
      from: to,
      to: from,
      text: reply,
    });

    return new Response(JSON.stringify({ status: 'Message sent', reply }), {
      status: 200,
    });
  } catch (error) {
    console.error('Handler error:', error);
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
    });
  }
}