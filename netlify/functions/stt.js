const axios = require('axios');
const busboy = require('busboy');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    return { statusCode: 401, body: JSON.stringify({ error: 'OpenRouter API Key not configured' }) };
  }

  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: event.headers });
    let lang = 'en';
    let fileBuffer = Buffer.alloc(0);
    let fileName = '';
    let mimeType = '';

    bb.on('field', (name, val) => {
      if (name === 'lang') lang = val;
    });

    bb.on('file', (name, file, info) => {
      fileName = info.filename;
      mimeType = info.mimeType;
      file.on('data', (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
    });

    bb.on('close', async () => {
      try {
        console.log(`[STT] Sending audio to OpenRouter: ${fileName} (${mimeType}), Lang=${lang}`);

        // Convert buffer to base64 for multimodal input
        const base64Audio = fileBuffer.toString('base64');

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: "google/gemini-3.1-flash",
          messages: [
            {
              role: "system",
              content: `You are an expert transcriptionist. Transcribe the following audio file. 
                        Target Language: ${lang}. 
                        Include [HH:MM:SS] timestamps at speaker changes. 
                        Format as HTML: <p><span class="timestamp">[00:00:00]</span> <span class="speaker">Speaker 1:</span> ...</p>`
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Please transcribe this audio exactly and provide a one-paragraph summary at the very end marked with [SUMMARY]." },
                { type: "image_url", url: `data:${mimeType};base64,${base64Audio}` } // Gemini multimodal format for audio/files
              ]
            }
          ]
        }, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.SITE_URL || 'http://localhost:8888',
            'X-Title': 'Aurelius Audio Studio'
          }
        });

        const fullResponse = response.data.choices[0].message.content;
        
        // Split transcript and summary
        const parts = fullResponse.split('[SUMMARY]');
        const transcript = parts[0].trim();
        const summary = parts[1] ? parts[1].trim() : "No summary generated.";

        resolve({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, summary, creditsUsed: 1 })
        });
      } catch (error) {
        console.error('[STT] OpenRouter Error:', error.response?.data || error.message);
        resolve({
          statusCode: 500,
          body: JSON.stringify({ error: 'Transcription failed', details: error.message })
        });
      }
    });

    bb.write(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
    bb.end();
  });
};
