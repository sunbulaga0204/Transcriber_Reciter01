const axios = require('axios');
require('dotenv').config();

async function testAudio() {
  try {
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'openai/gpt-audio-mini',
      messages: [{ role: 'user', content: 'Say hello world' }],
      modalities: ['text', 'audio'],
      audio: {
        voice: 'alloy',
        format: 'mp3'
      }
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
    });
    console.log("Chat response:", res.status, res.data.choices[0].message);
  } catch (err) {
    console.error("Chat error:", err.response?.data || err.message);
  }
}
testAudio();
