import axios from 'axios';
import type { STTResponse } from '../types/index.js';

// In-memory cache for recovering failed fetches (last result per user)
const recoveryCache = new Map<string, { buffer: Buffer, timestamp: number }>();

export async function generateTTS(userId: string, text: string, voice?: string, speed?: string, prompt?: string): Promise<Buffer> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');

    // Improve speed instruction to be more natural, factoring in a slower baseline
    const speedVal = parseFloat(speed || '1.0');
    let speedInstruction = 'Read at a careful, measured academic pace. Throttled down slightly for clarity. Breathe naturally between sentences.';
    if (speedVal > 1.2) {
        speedInstruction = `Read at a brisk pace (around ${speedVal}x speed), but you MUST maintain clarity and professional articulation. Do not rush complex words.`;
    } else if (speedVal < 0.8) {
        speedInstruction = `Read at a very slow, deliberate pace (around ${speedVal}x speed). Ensure every single word is emphasized and distinct.`;
    }

    let personaInstructions = '';
    if (voice === 'british-rp') {
        personaInstructions = 'Use a sophisticated British Received Pronunciation (RP) accent. You are narrating a complex academic lecture. You must speak at a very deliberate, slow, and measured pace. Insert thoughtful pauses after complex terms and at the end of every sentence. The tone should be formal, clear, and elegant.';
    } else if (voice === 'australian') {
        personaInstructions = 'Use a natural Australian accent. The tone should be friendly, clear, and laid-back. Speak at a measured pace.';
    } else if (voice === 'arabic') {
        personaInstructions = 'Use a clear and professional Arabic accent. The tone should be culturally authentic, authoritative, and smooth. Enunciate complex terminology clearly.';
    }

    // Split text into chunks to maintain quality and avoid model degradation on long texts
    const chunks = splitTextBySentence(text, 350); // Slightly larger chunks for efficiency
    console.log(`[Gemini TTS] Splitting ${text.split(/\s+/).length} words into ${chunks.length} chunks. Processing in PARALLEL.`);

    // Process chunks in parallel to prevent timeouts
    const chunkPromises = chunks.map(async (chunk, i) => {
        // Pre-process chunk to force pacing in long run-on sentences
        const pacedChunk = forcePacing(chunk);

        const finalPrompt = `
Instruction: Please act as a professional voice actor.
Persona: ${personaInstructions}
Specific Director Instructions: ${prompt || 'None'}
Reading Speed: ${speedInstruction}

IMPORTANT DIRECTIVES:
1. Output ONLY the raw audio for the text provided below. Do not add any introductory or concluding remarks.
2. Maintain a consistent voice and high audio quality.
3. PACING & BREATHING: Do not rush. Take micro-pauses at commas and full pauses at periods. If a sentence is long, insert natural breathing pauses.
4. OOV & FOREIGN TERMS: When encountering foreign, academic, or transliterated terms (e.g., Arabic/Malay terms like fiqh or muamalat), slow down and enunciate every syllable clearly. Do not compress or slur these words.

Text to read:
${pacedChunk}
`.trim();

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
            {
                contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
                generationConfig: { responseModalities: ["AUDIO"] }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 180000 
            }
        );

        const candidates = response.data.candidates;
        if (!candidates || candidates.length === 0) throw new Error(`No candidates returned for chunk ${i+1}`);
        
        const audioPart = candidates[0].content.parts.find((p: any) => p.inlineData && p.inlineData.mimeType.startsWith('audio/'));
        if (!audioPart) throw new Error(`No audio data for chunk ${i+1}`);

        return Buffer.from(audioPart.inlineData.data, 'base64');
    });

    const pcmChunks = await Promise.all(chunkPromises);
    const fullPcm = Buffer.concat(pcmChunks);
    const wavBuffer = wrapPcmInWav(fullPcm, 48000);

    // Save to recovery cache
    recoveryCache.set(userId, { buffer: wavBuffer, timestamp: Date.now() });

    return wavBuffer;
}

export function getRecoverableTTS(userId: string): Buffer | null {
    const entry = recoveryCache.get(userId);
    if (!entry) return null;
    
    // Cache for 1 hour
    if (Date.now() - entry.timestamp > 3600000) {
        recoveryCache.delete(userId);
        return null;
    }
    
    return entry.buffer;
}

function splitTextBySentence(text: string, maxWords: number): string[] {
    // Basic sentence splitting: look for punctuation followed by space
    const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|.+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = "";
    let currentCount = 0;

    for (const sentence of sentences) {
        const words = sentence.trim().split(/\s+/);
        const wordCount = words.length;

        // If a single sentence is longer than maxWords, split it by words instead
        if (wordCount > maxWords) {
            if (currentChunk !== "") {
                chunks.push(currentChunk.trim());
                currentChunk = "";
                currentCount = 0;
            }
            for (let i = 0; i < words.length; i += maxWords) {
                chunks.push(words.slice(i, i + maxWords).join(' '));
            }
            continue;
        }

        if (currentCount + wordCount > maxWords && currentChunk !== "") {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
            currentCount = wordCount;
        } else {
            currentChunk += (currentChunk === "" ? "" : " ") + sentence;
            currentCount += wordCount;
        }
    }
    if (currentChunk !== "") {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}

/**
 * Injects synthetic pauses (ellipses) into long run-on sentences 
 * to force the TTS engine to take micro-pauses and prevent tempo runaway.
 */
function forcePacing(text: string): string {
    const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|.+/g) || [text];
    
    return sentences.map(sentence => {
        const words = sentence.trim().split(/\s+/);
        // If sentence is longer than 15 words and lacks internal pausing commas
        if (words.length > 15 && !sentence.includes(',')) {
            const conjunctions = ['and', 'but', 'or', 'because', 'which', 'that', 'where', 'while', 'furthermore'];
            let modified = false;
            
            // Try to find a logical break point (conjunction) near the middle
            for (let i = 7; i < words.length - 5; i++) {
                if (conjunctions.includes(words[i].toLowerCase())) {
                    words[i] = '... ' + words[i];
                    modified = true;
                    break;
                }
            }
            
            // Fallback: just split it in the middle to force a breath
            if (!modified) {
                const mid = Math.floor(words.length / 2);
                words[mid] = words[mid] + ' ...';
            }
            return words.join(' ');
        }
        return sentence;
    }).join(' ');
}

function wrapPcmInWav(pcmBuffer: Buffer, sampleRate: number): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const header = Buffer.alloc(44);

    // RIFF identifier
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8);

    // Format chunk identifier
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Format chunk size
    header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // Byte rate
    header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // Block align
    header.writeUInt16LE(bitsPerSample, 34);

    // Data chunk identifier
    header.write('data', 36);
    header.writeUInt32LE(pcmBuffer.length, 40);

    return Buffer.concat([header, pcmBuffer]);
}

export async function transcribeAudio(fileBuffer: Buffer, mimeType: string, lang: string = 'en', diarize: boolean = true): Promise<STTResponse> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');

    const base64Data = fileBuffer.toString('base64');
    
    let diarizationInstruction = '';
    if (diarize) {
        diarizationInstruction = '2. Use Speaker Diarization: Distinguish speakers and label them.\n3. Format with precise time ranges like [00:00 - 00:05] Speaker Name: [Text].';
    } else {
        diarizationInstruction = '2. Format with precise time ranges like [00:00 - 00:05] at the start of meaningful segments.';
    }

    const prompt = `Please act as a professional transcriber. 
1. Transcribe the provided audio file exactly as spoken. 
${diarizationInstruction}
4. After the transcription, provide a line break with "---SUMMARY---" and then write a concise 1-paragraph summary of the audio.
Ensure the transcription is highly accurate. Language: ${lang}`;

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType, data: base64Data } },
                        { text: prompt }
                    ]
                }
            ]
        },
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: 180000, // 3 minutes
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        }
    );

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) throw new Error("No candidates returned from Gemini");
    
    const fullText = candidates[0].content.parts.map((p: any) => p.text).join(' ');
    
    const splitTag = '---SUMMARY---';
    let transcript = fullText;
    let summary = 'Summary generation skipped or format failed.';
    
    if (fullText.includes(splitTag)) {
        const parts = fullText.split(splitTag);
        transcript = parts[0].trim();
        summary = parts[1].trim();
    }

    const formattedTranscript = transcript.split('\n')
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => {
            // Bold Speaker labels and colorize timestamps
            let processed = line
                .replace(/\[(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})\]/g, '<span class="timestamp">[$1]</span>')
                .replace(/^(Speaker [A-Z]|[\w\s]+):/i, '<strong>$1:</strong>');
            return `<p>${processed}</p>`;
        })
        .join('');

    return {
        transcript: formattedTranscript,
        summary,
        pointsRemaining: 0 // To be filled by caller
    };
}
