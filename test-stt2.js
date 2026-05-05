const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

async function testSTT() {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream('test.txt'), { filename: 'test.txt' });
    form.append('model', 'openai/whisper-1');
    
    const transcriptRes = await axios.post(
      'https://openrouter.ai/api/v1/audio/transcriptions',
      form,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          ...form.getHeaders()
        }
      }
    );
    console.log("STT response:", transcriptRes.status);
  } catch (err) {
    console.error("STT error:", err.response?.data || err.message);
  }
}
testSTT();
