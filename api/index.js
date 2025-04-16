export default async function handler(req, res) {
  const { Body } = req.body;

  if (!Body) {
    return res.status(400).json({ error: 'Missing Body field' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: Body }],
        max_tokens: 100,
      }),
    });

    const data = await response.json();

    const reply = data.choices?.[0]?.message?.content?.trim() || 'Sorry, I couldn’t generate a response.';

    return res.status(200).json({ reply });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to generate response' });
  }
}