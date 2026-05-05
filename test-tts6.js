const axios = require('axios');
require('dotenv').config();

async function testKokoro() {
  try {
    const res = await axios.post('https://openrouter.ai/api/v1/audio/speech', {
      model: 'hexgrad/kokoro-82m',
      input: 'Hello world',
      voice: 'af_heart'
    }, {
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` },
      responseType: 'arraybuffer'
    });
    console.log("Kokoro response:", res.status);
    require('fs').writeFileSync('test.mp3', Buffer.from(res.data));
  } catch (err) {
    console.error("Kokoro error:", err.response?.data ? Buffer.from(err.response.data).toString() : err.message);
  }
}
testKokoro();
