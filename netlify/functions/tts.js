const axios = require('axios');
const { validateJWT } = require('./utils/auth');
const { deductPoint, refundPoint } = require('./utils/points');
const { checkRateLimit } = require('./utils/ratelimit');

const MAX_TEXT_BYTES = 10 * 1024; // 10KB of text is more than enough (~5000 words)

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // --- 1. JWT Validation ---
  const auth = validateJWT(event.headers['authorization']);
  if (!auth.valid) {
    return { statusCode: 401, body: JSON.stringify({ error: auth.error }) };
  }
  const { userId } = auth;

  // --- 2. Rate Limiting (1 request per 5 minutes) ---
  const rateCheck = await checkRateLimit(userId, 'tts');
  if (!rateCheck.allowed) {
    const minutes = Math.ceil(rateCheck.retryAfterSeconds / 60);
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: `Rate limit reached. You can generate audio once every 5 minutes. Please wait ${rateCheck.retryAfterSeconds} seconds (≈${minutes} min).`
      })
    };
  }

  // --- 3. Parse & Validate Input ---
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { text, voice, speed, prompt } = body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Text is required' }) };
  }

  if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
    return {
      statusCode: 413,
      body: JSON.stringify({
        error: `Text exceeds the 10KB limit (≈5000 words). Please split your text into smaller sections and generate each one separately.`
      })
    };
  }

  // --- 4. Pre-deduct 1 Point BEFORE API call ---
  const deduction = await deductPoint(userId, 1);
  if (!deduction.success) {
    return {
      statusCode: 402,
      body: JSON.stringify({
        error: `Insufficient points. You have ${deduction.remaining} point(s) remaining. Please top up in your Dashboard.`
      })
    };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    await refundPoint(userId, 1);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: Missing API key' }) };
  }

  // --- 5. Call OpenRouter ---
  let apiSuccess = false;
  try {
    console.log(`[TTS] User=${userId}, Voice=${voice}, Speed=${speed}`);

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'google/gemini-3.1-flash-tts',
      messages: [
        {
          role: 'system',
          content: `You are a high-fidelity TTS engine. Accent: ${voice || 'british-rp'}. Speed: ${speed || 1.0}. Director Note: ${prompt || 'None'}.`
        },
        { role: 'user', content: text }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL,
        'X-Title': 'Aurelius Audio Studio'
      },
      timeout: 30000
    });

    apiSuccess = true;
    const audioData = response.data?.choices?.[0]?.message?.audio;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'TTS generation successful',
        audioUrl: audioData?.url || null,
        audioBase64: audioData?.data || null,
        pointsRemaining: deduction.remaining
      })
    };

  } catch (error) {
    // --- 6. Refund on verified API failure ---
    const errMessage = error.response?.data?.error?.message || error.message || '';
    const isApiError = error.response?.status >= 400 || error.code === 'ECONNABORTED';

    if (isApiError && !apiSuccess) {
      await refundPoint(userId, 1);
      console.warn(`[TTS] API failed for user=${userId}. Point refunded. Reason: ${errMessage}`);
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'The speech synthesis service returned an error. Your point has been refunded.',
          details: errMessage
        })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unexpected server error', details: errMessage })
    };
  }
};
