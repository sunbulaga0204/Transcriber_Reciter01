const axios = require('axios');
const busboy = require('busboy');
const { validateJWT } = require('./utils/auth');
const { deductPoint, refundPoint } = require('./utils/points');
const { checkRateLimit } = require('./utils/ratelimit');

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB hard limit

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
  const rateCheck = await checkRateLimit(userId, 'stt');
  if (!rateCheck.allowed) {
    const minutes = Math.ceil(rateCheck.retryAfterSeconds / 60);
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: `Rate limit reached. You can transcribe once every 5 minutes. Please wait ${rateCheck.retryAfterSeconds} seconds (≈${minutes} min).`
      })
    };
  }

  // --- 3. Pre-deduct 1 Point BEFORE processing ---
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
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: Missing API key' }) };
  }

  // --- 4. Parse multipart form with 10MB enforcement ---
  return new Promise((resolve) => {
    const bb = busboy({
      headers: event.headers,
      limits: { fileSize: MAX_FILE_BYTES }
    });

    let lang = 'en';
    let fileBuffer = Buffer.alloc(0);
    let fileName = '';
    let mimeType = '';
    let fileSizeExceeded = false;

    bb.on('field', (name, val) => {
      if (name === 'lang') lang = val;
    });

    bb.on('file', (name, file, info) => {
      fileName = info.filename;
      mimeType = info.mimeType;

      file.on('data', (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });

      // busboy fires this event when the limit is hit
      file.on('limit', () => {
        fileSizeExceeded = true;
      });
    });

    bb.on('close', async () => {
      // --- 5. Reject oversized files and refund immediately ---
      if (fileSizeExceeded) {
        await refundPoint(userId, 1);
        return resolve({
          statusCode: 413,
          body: JSON.stringify({
            error: `Audio file exceeds the 10MB limit. Please split your recording into smaller segments or compress it before uploading. Your point has been refunded.`
          })
        });
      }

      if (fileBuffer.length === 0) {
        await refundPoint(userId, 1);
        return resolve({
          statusCode: 400,
          body: JSON.stringify({ error: 'No audio file received. Your point has been refunded.' })
        });
      }

      // --- 6. Call OpenRouter ---
      let apiSuccess = false;
      try {
        console.log(`[STT] User=${userId}, File=${fileName} (${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB), Lang=${lang}`);
        const base64Audio = fileBuffer.toString('base64');

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: 'google/gemini-3.1-flash',
          messages: [
            {
              role: 'system',
              content: `You are an expert transcriptionist. Transcribe the audio exactly. Target Language: ${lang}. 
                Include [HH:MM:SS] timestamps at speaker changes or every 30 seconds. 
                Format each line as HTML: <p><span class="timestamp">[00:00:00]</span> <span class="speaker">Speaker 1:</span> ...</p>
                At the very end, add a one-paragraph summary on a new line starting with exactly: [SUMMARY]`
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Please transcribe this audio file.' },
                { type: 'image_url', url: `data:${mimeType};base64,${base64Audio}` }
              ]
            }
          ]
        }, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.SITE_URL,
            'X-Title': 'Aurelius Audio Studio'
          },
          timeout: 60000
        });

        apiSuccess = true;
        const fullResponse = response.data?.choices?.[0]?.message?.content || '';
        const parts = fullResponse.split('[SUMMARY]');
        const transcript = parts[0].trim();
        const summary = parts[1] ? parts[1].trim() : 'No summary available.';

        return resolve({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, summary, pointsRemaining: deduction.remaining })
        });

      } catch (error) {
        // --- 7. Refund on verified API failure ---
        const errMessage = error.response?.data?.error?.message || error.message || '';
        const isApiError = error.response?.status >= 400 || error.code === 'ECONNABORTED';

        if (isApiError && !apiSuccess) {
          await refundPoint(userId, 1);
          console.warn(`[STT] API failed for user=${userId}. Point refunded. Reason: ${errMessage}`);
          return resolve({
            statusCode: 502,
            body: JSON.stringify({
              error: 'The transcription service returned an error. Your point has been refunded.',
              details: errMessage
            })
          });
        }

        return resolve({
          statusCode: 500,
          body: JSON.stringify({ error: 'Unexpected server error', details: errMessage })
        });
      }
    });

    bb.write(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
    bb.end();
  });
};
