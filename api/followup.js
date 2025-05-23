import fs from 'fs';
import path from 'path';

// @vercel/cron: daily, 12:00

const contactsPath = path.resolve('./contacts.json');

const followUps = [
  "Just checking in — Alexey’s experience with 200+ sales might be exactly what you need. Want to see a quick intro video?",
  "Still open to selling? Many of Alexey’s clients say watching his videos helped them decide. Want the link?",
  "Alexey specializes in getting top dollar. Curious how he does it? His clients love the way he explains things.",
  "Not sure if now’s the time to sell? Alexey’s insights might help — want to check them out?",
  "Final follow-up — Alexey’s helped many sellers just like you. If you’re curious, I can send his site or a quick video!"
];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  let telnyx;
  try {
    const { default: Telnyx } = await import('telnyx');
    telnyx = Telnyx(process.env.TELNYX_API_KEY);
  } catch (err) {
    console.error("❌ Failed to import Telnyx:", err);
    return res.status(500).json({ error: 'Telnyx init failed' });
  }

  let contacts = [];
  try {
    contacts = JSON.parse(fs.readFileSync(contactsPath, 'utf-8'));
  } catch (err) {
    console.error("❌ Failed to read contacts.json:", err);
    return res.status(500).json({ error: 'Missing or invalid contacts.json' });
  }
  const now = new Date();

  for (let contact of contacts) {
    if (contact.followUpCount >= 5) continue;

    const lastDate = contact.lastFollowUpDate ? new Date(contact.lastFollowUpDate) : null;
    const diff = lastDate ? (now - lastDate) / (1000 * 60 * 60 * 24) : Infinity;

    if (diff >= 1) {
      const msg = followUps[contact.followUpCount];
      try {
        await telnyx.messages.create({
          from: process.env.TELNYX_NUMBER,
          to: contact.phone,
          text: msg,
          messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
        });
        console.log(`✅ Sent follow-up to ${contact.phone}`);

        contact.followUpCount = (contact.followUpCount || 0) + 1;
        contact.lastFollowUpDate = now.toISOString();
        console.log(`✅ Updated follow-up data for ${contact.phone}`);
      } catch (err) {
        console.error(`❌ Failed to send to ${contact.phone}:`, err);
      }
    }
  }

  fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2));
  return res.status(200).json({ status: 'Follow-ups sent' });
}