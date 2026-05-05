const axios = require('axios');
require('dotenv').config();

async function testChat() {
  try {
    const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'google/gemini-3.1-flash-tts-preview',
      messages: [{ role: 'user', content: 'Hello' }]
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
    });
    console.log("Chat response:", res.status);
  } catch (err) {
    console.error("Chat error:", err.response?.data || err.message);
  }
}
testChat();
