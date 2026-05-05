const axios = require('axios');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { text, voice, speed, prompt } = JSON.parse(event.body);
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'OpenRouter API Key not configured' })
    };
  }

  try {
    console.log(`[TTS] Requesting OpenRouter: Model=google/gemini-3.1-flash-tts, Voice=${voice}`);

    // This is a representative call to OpenRouter's TTS capabilities
    // Note: Model names and parameters may vary based on OpenRouter's current implementation
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: "google/gemini-3.1-flash-tts",
      messages: [
        { role: "system", content: `You are a high-fidelity TTS engine. Accent: ${voice}. Speed: ${speed}. Director Prompt: ${prompt}` },
        { role: "user", content: text }
      ],
      response_format: { type: "audio", format: "mp3" } // Hypothetical OpenRouter TTS format
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:8888',
        'X-Title': 'Aurelius Audio Studio'
      }
    });

    // Handle audio response (assuming it returns a URL or base64)
    const audioData = response.data.choices[0].message.audio; 

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'TTS generation successful',
        audioUrl: audioData.url || null,
        audioBase64: audioData.data || null,
        creditsUsed: 1
      })
    };
  } catch (error) {
    console.error('[TTS] OpenRouter Error:', error.response?.data || error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to synthesize speech via OpenRouter',
        details: error.response?.data?.error?.message || error.message
      })
    };
  }
};
