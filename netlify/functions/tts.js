const axios = require('axios');
const { validateJWT } = require('./utils/auth');
const { deductPoint, refundPoint } = require('./utils/points');
const { checkRateLimit } = require('./utils/ratelimit');

const MAX_TEXT_CHARS = 4096;

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

  const { text, prompt } = body; // Voice and speed can be embedded in the prompt for Gemini

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Text is required.' }) };
  }
  if (text.length > MAX_TEXT_CHARS) {
    return {
      statusCode: 413,
      body: JSON.stringify({
        error: `Text exceeds the limit of ${MAX_TEXT_CHARS} characters.`
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

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    await refundPoint(userId, 1);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: Missing GOOGLE_API_KEY.' }) };
  }

  let apiSuccess = false;
  try {
    // Build instruction for Gemini Audio
    const systemInstruction = prompt 
      ? `You are a high-fidelity voice actor. ${prompt}\n\nPlease read the following text exactly as written, following the director instructions.`
      : `You are a high-fidelity voice actor. Please read the following text naturally and clearly.`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [
          { role: 'user', parts: [{ text }] }
        ],
        generationConfig: {
          responseModalities: ["AUDIO"]
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    apiSuccess = true;
    
    // Extract base64 audio from Gemini's response
    // Response format: candidates[0].content.parts[0].inlineData.data (base64)
    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned from Gemini");
    }
    
    const parts = candidates[0].content.parts;
    const audioPart = parts.find(p => p.inlineData && p.inlineData.mimeType.startsWith('audio/'));
    
    if (!audioPart) {
      throw new Error("Gemini responded, but did not return audio inlineData.");
    }

    const base64Audio = audioPart.inlineData.data;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: base64Audio,
        mimeType: audioPart.inlineData.mimeType || 'audio/wav',
        pointsRemaining: deduction.remaining
      })
    };

  } catch (error) {
    const statusCode = error.response?.status;
    const errMessage = error.response?.data?.error?.message || error.message;

    if (!apiSuccess) {
      await refundPoint(userId, 1);
      console.warn(`[TTS] Google API failed. Point refunded. Status=${statusCode}, Reason=${errMessage}`);
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
