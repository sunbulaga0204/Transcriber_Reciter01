const axios = require('axios');
const busboy = require('busboy');
const { validateJWT } = require('./utils/auth');
const { deductPoint, refundPoint } = require('./utils/points');
const { checkRateLimit } = require('./utils/ratelimit');

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

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

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    await refundPoint(userId, 1);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: Missing GOOGLE_API_KEY.' }) };
  }

  // --- 4. Parse multipart form to get audio buffer ---
  return new Promise((resolve) => {
    const bb = busboy({ headers: event.headers, limits: { fileSize: MAX_FILE_BYTES } });

    let lang = 'en';
    let fileBuffer = Buffer.alloc(0);
    let mimeType = 'audio/webm';
    let fileSizeExceeded = false;

    bb.on('field', (name, val) => {
      if (name === 'lang') lang = val;
    });

    bb.on('file', (name, file, info) => {
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
            error: 'Audio file exceeds 10MB. Please split your recording into smaller parts. Your point has been refunded.'
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
        console.log(`[STT] User=${userId}, Size=${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB, Lang=${lang}`);

        const base64Data = fileBuffer.toString('base64');
        const prompt = `Please act as a professional transcriber. 
1. Transcribe the provided audio file exactly as spoken. Format it with timestamps like [00:00] for different segments or speakers.
2. After the transcription, provide a line break with "---SUMMARY---" and then write a concise 1-paragraph summary of the audio.
Ensure the transcription is highly accurate.`;

        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-native-audio-preview-12-2025:generateContent?key=${apiKey}`,
          {
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: base64Data
                    }
                  },
                  { text: prompt }
                ]
              }
            ]
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 120000,
            maxContentLength: MAX_FILE_BYTES * 2
          }
        );

        apiSuccess = true;
        
        // Parse response
        const candidates = response.data.candidates;
        if (!candidates || candidates.length === 0) {
            throw new Error("No candidates returned from Gemini");
        }
        
        const fullText = candidates[0].content.parts.map(p => p.text).join(' ');
        
        // Split text into transcript and summary
        const splitTag = '---SUMMARY---';
        let transcript = fullText;
        let summary = 'Summary generation skipped or format failed.';
        
        if (fullText.includes(splitTag)) {
            const parts = fullText.split(splitTag);
            transcript = parts[0].trim();
            summary = parts[1].trim();
        }

        // Format transcript string into paragraphs/HTML
        const formattedTranscript = transcript.split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => `<p>${line.replace(/\[(\d{2}:\d{2})\]/g, '<span class="timestamp">[$1]</span>')}</p>`)
            .join('');

        return resolve({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              transcript: formattedTranscript, 
              summary, 
              pointsRemaining: deduction.remaining 
          })
        });

      } catch (error) {
        const statusCode = error.response?.status;
        const errMessage = error.response?.data?.error?.message || error.message;

        if (!apiSuccess) {
          await refundPoint(userId, 1);
          console.warn(`[STT] Google API failed for user=${userId}. Point refunded. Status=${statusCode}, Reason=${errMessage}`);
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
