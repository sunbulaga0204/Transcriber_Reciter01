const axios = require('axios');
const { validateJWT } = require('./utils/auth');
const { deductPoint, refundPoint } = require('./utils/points');
const { checkRateLimit } = require('./utils/ratelimit');

const MAX_TEXT_CHARS = 4096; // OpenAI TTS limit

const VOICE_MAP = {
  'british-rp': 'onyx',      // Deep, formal British-sounding
  'australian': 'nova',       // Friendly, natural
  'arabic': 'shimmer',
  'malay': 'nova',
};

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

  // --- 2. Rate Limiting ---
  const rateCheck = await checkRateLimit(userId, 'tts');
  if (!rateCheck.allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: `Rate limit reached. Please wait ${rateCheck.retryAfterSeconds} seconds before generating again.`
      })
    };
  }

  // --- 3. Parse & Validate Input ---
  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { text, voice = 'british-rp', speed = 1.0, prompt } = body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Text is required.' }) };
  }
  if (text.length > MAX_TEXT_CHARS) {
    return {
      statusCode: 413,
      body: JSON.stringify({
        error: `Text exceeds the limit of ${MAX_TEXT_CHARS} characters (~700 words). Please split your text into smaller sections.`
      })
    };
  }

  // --- 4. Pre-deduct 1 Point ---
  const deduction = await deductPoint(userId, 1);
  if (!deduction.success) {
    return {
      statusCode: 402,
      body: JSON.stringify({
        error: `Insufficient points. You have ${deduction.remaining} point(s). Please top up in your Dashboard.`
      })
    };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    await refundPoint(userId, 1);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: Missing API key.' }) };
  }

  // Build the input text with director prompt if provided
  const inputText = prompt ? `[${prompt}]\n\n${text}` : text;
  const ttsVoice = VOICE_MAP[voice] || 'onyx';

  let apiSuccess = false;
  try {
    console.log(`[TTS] User=${userId}, Voice=${voice}->${ttsVoice}, Speed=${speed}`);

    const response = await axios.post(
      'https://openrouter.ai/api/v1/audio/speech',
      {
        model: 'openai/tts-1',
        input: inputText,
        voice: ttsVoice,
        speed: parseFloat(speed),
        response_format: 'mp3'
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.SITE_URL,
          'X-Title': 'Aurelius Audio Studio'
        },
        responseType: 'arraybuffer',
        timeout: 30000
      }
    );

    apiSuccess = true;
    const base64Audio = Buffer.from(response.data).toString('base64');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: base64Audio,
        mimeType: 'audio/mp3',
        pointsRemaining: deduction.remaining
      })
    };

  } catch (error) {
    const statusCode = error.response?.status;
    let errMessage = error.message;

    // Try to parse ArrayBuffer error response
    if (error.response?.data) {
      try {
        const decoded = Buffer.from(error.response.data).toString('utf8');
        const parsed = JSON.parse(decoded);
        errMessage = parsed.error?.message || parsed.error || errMessage;
      } catch (_) {}
    }

    if (!apiSuccess) {
      await refundPoint(userId, 1);
      console.warn(`[TTS] API failed for user=${userId}. Point refunded. Status=${statusCode}, Reason=${errMessage}`);
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: `Speech synthesis failed. Your point has been refunded. Detail: ${errMessage}`
        })
      };
    }

    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected server error.' }) };
  }
};
