const FormData = require('form-data');
const axios = require('axios');
const busboy = require('busboy');
const { validateJWT } = require('./utils/auth');
const { deductPoint, refundPoint } = require('./utils/points');
const { checkRateLimit } = require('./utils/ratelimit');

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

const LANG_MAP = {
  'en': 'en', 'ar': 'ar', 'ms': 'ms', 'id': 'id'
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
  const rateCheck = await checkRateLimit(userId, 'stt');
  if (!rateCheck.allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: `Rate limit reached. Please wait ${rateCheck.retryAfterSeconds} seconds before transcribing again.`
      })
    };
  }

  // --- 3. Pre-deduct 1 Point ---
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

  // --- 4. Parse multipart form with 10MB enforcement ---
  return new Promise((resolve) => {
    const bb = busboy({ headers: event.headers, limits: { fileSize: MAX_FILE_BYTES } });

    let lang = 'en';
    let fileBuffer = Buffer.alloc(0);
    let fileName = 'audio.webm';
    let mimeType = 'audio/webm';
    let fileSizeExceeded = false;

    bb.on('field', (name, val) => {
      if (name === 'lang') lang = val;
    });

    bb.on('file', (name, file, info) => {
      fileName = info.filename || fileName;
      mimeType = info.mimeType || mimeType;
      file.on('data', (data) => { fileBuffer = Buffer.concat([fileBuffer, data]); });
      file.on('limit', () => { fileSizeExceeded = true; });
    });

    bb.on('close', async () => {
      if (fileSizeExceeded) {
        await refundPoint(userId, 1);
        return resolve({
          statusCode: 413,
          body: JSON.stringify({
            error: 'Audio file exceeds 10MB. Please split your recording into smaller parts or compress it. Your point has been refunded.'
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

      let apiSuccess = false;
      try {
        const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`[STT] User=${userId}, File=${fileName} (${fileSizeMB}MB), Lang=${lang}`);

        // Use OpenRouter's Whisper endpoint for transcription
        const form = new FormData();
        form.append('file', fileBuffer, { filename: fileName, contentType: mimeType });
        form.append('model', 'openai/whisper-1');
        form.append('language', LANG_MAP[lang] || 'en');
        form.append('response_format', 'verbose_json');
        form.append('timestamp_granularities[]', 'segment');

        const transcriptRes = await axios.post(
          'https://openrouter.ai/api/v1/audio/transcriptions',
          form,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': process.env.SITE_URL,
              'X-Title': 'Aurelius Audio Studio',
              ...form.getHeaders()
            },
            timeout: 120000,
            maxContentLength: MAX_FILE_BYTES * 2
          }
        );

        apiSuccess = true;
        const whisperData = transcriptRes.data;

        // Format transcript with timestamps from Whisper's segment data
        let formattedTranscript = '';
        if (whisperData.segments && whisperData.segments.length > 0) {
          whisperData.segments.forEach((seg, i) => {
            const ts = formatTimestamp(seg.start);
            const speakerNum = (i % 2) + 1; // Simple alternating speaker diarization
            formattedTranscript += `<p><span class="timestamp">[${ts}]</span> <span class="speaker">Speaker ${speakerNum}:</span> ${seg.text.trim()}</p>\n`;
          });
        } else {
          formattedTranscript = `<p>${whisperData.text}</p>`;
        }

        // Generate summary using a text model via OpenRouter
        let summary = 'Summary generation skipped.';
        try {
          const summaryRes = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              model: 'google/gemini-flash-1.5',
              messages: [
                { role: 'system', content: 'You are a research assistant. Summarize the following transcript in one concise paragraph, highlighting the key points and topics discussed.' },
                { role: 'user', content: whisperData.text }
              ],
              max_tokens: 300
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.SITE_URL,
                'X-Title': 'Aurelius Audio Studio'
              },
              timeout: 30000
            }
          );
          summary = summaryRes.data?.choices?.[0]?.message?.content || summary;
        } catch (summaryErr) {
          console.warn('[STT] Summary generation failed (non-critical):', summaryErr.message);
        }

        return resolve({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: formattedTranscript, summary, pointsRemaining: deduction.remaining })
        });

      } catch (error) {
        const statusCode = error.response?.status;
        const errMessage = error.response?.data?.error?.message || error.response?.data?.error || error.message;

        if (!apiSuccess) {
          await refundPoint(userId, 1);
          console.warn(`[STT] API failed for user=${userId}. Point refunded. Status=${statusCode}, Reason=${errMessage}`);
          return resolve({
            statusCode: 502,
            body: JSON.stringify({
              error: `Transcription failed. Your point has been refunded. Detail: ${errMessage}`
            })
          });
        }

        return resolve({ statusCode: 500, body: JSON.stringify({ error: 'Unexpected server error.' }) });
      }
    });

    bb.write(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
    bb.end();
  });
};

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}
