export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONTACTS_PATH = path.resolve('./contacts.json');
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID;
const TELNYX_FROM_NUMBER = process.env.TELNYX_FROM_NUMBER;

const followUps = [
  "Just checking in — Alexey's experience with 200+ sales might be exactly what you need. Want to see a quick intro video?",
  "Still open to selling? Many of Alexey's clients say watching his videos helped them decide. Want the link?",
  "Alexey specializes in getting top dollar. Curious how he does it? His clients love the way he explains things.",
  "Not sure if now's the time to sell? Alexey's insights might help — want to check them out?",
  "Final follow-up — Alexey's helped many sellers just like you. If you're curious, I can send his site or a quick video!"
];

async function sendSms(to, text) {
  const payload = {
    from: TELNYX_FROM_NUMBER,
    to,
    text,
    messaging_profile_id: TELNYX_MESSAGING_PROFILE_ID,
  };
  const res = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TELNYX_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function GET() {
  let contacts = [];
  try {
    contacts = JSON.parse(fs.readFileSync(CONTACTS_PATH, 'utf-8'));
  } catch (err) {
    return NextResponse.json({ error: 'Missing or invalid contacts.json' }, { status: 500 });
  }
  const now = new Date();
  const results = [];
  for (let contact of contacts) {
    if (contact.followUpCount >= 5) continue;
    const lastDate = contact.lastFollowUpDate ? new Date(contact.lastFollowUpDate) : null;
    const diff = lastDate ? (now - lastDate) / (1000 * 60 * 60 * 24) : Infinity;
    if (diff >= 1) {
      const msg = followUps[contact.followUpCount];
      try {
        await sendSms(contact.phone, msg);
        contact.followUpCount = (contact.followUpCount || 0) + 1;
        contact.lastFollowUpDate = now.toISOString();
        results.push({ phone: contact.phone, sent: true, msg });
      } catch (err) {
        results.push({ phone: contact.phone, sent: false, error: err?.message });
      }
    }
  }
  fs.writeFileSync(CONTACTS_PATH, JSON.stringify(contacts, null, 2));
  return NextResponse.json({ results });
} 