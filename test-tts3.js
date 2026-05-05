const axios = require('axios');
require('dotenv').config();

async function testAudioSpeech() {
  try {
    const res = await axios.post('https://openrouter.ai/api/v1/audio/speech', {
      model: 'openai/tts-1',
      input: 'Hello',
      voice: 'onyx'
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
    });
    console.log("Audio speech response:", res.status);
  } catch (err) {
    console.error("Audio speech error:", err.response?.data || err.message);
  }
}
testAudioSpeech();
