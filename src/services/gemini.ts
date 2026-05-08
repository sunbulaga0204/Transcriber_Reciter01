import axios from 'axios';
import type { STTResponse } from '../types/index.js';

// In-memory cache for recovering failed fetches (last result per user)
const recoveryCache = new Map<string, { buffer: Buffer, timestamp: number }>();

export async function generateTTS(userId: string, text: string, voice?: string, speed?: string, prompt?: string): Promise<Buffer> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');

    // Build per-voice audio profile using the official structured prompt format
    let voiceProfile = '';
    if (voice === 'british-rp') {
        voiceProfile = `# AUDIO PROFILE: Professor Edmund
## "The Academic Lecturer"

## THE SCENE: University Lecture Hall
A grand, wood-panelled lecture hall with excellent acoustics. The professor stands at a podium, delivering a formal academic lecture to attentive students. The atmosphere is scholarly, precise, and unhurried.

### DIRECTOR'S NOTES
Style: Sophisticated, authoritative, and intellectually commanding. Every word is chosen with care.
Pacing: [very slow] Deliberate and measured. Insert a natural breath pause after every sentence. Pause longer on complex or foreign terms.
Articulation: Crisp British RP consonants. When encountering foreign or transliterated terms (Arabic, Malay, Latin), slow down further and enunciate every syllable individually.
Accent: Received Pronunciation (RP). Classic BBC English. Formal and elegant.
Additional: Do NOT rush. Academic content requires cognitive processing time for the listener.`;
    } else if (voice === 'australian') {
        voiceProfile = `# AUDIO PROFILE: Alex
## "The Friendly Guide"

## THE SCENE: Recording Studio
A warm, well-treated recording studio. Alex is relaxed, seated at a microphone, speaking naturally to a friendly audience.

### DIRECTOR'S NOTES
Style: Warm, approachable, and clear. Natural and conversational.
Pacing: Measured and comfortable. Not rushed.
Accent: Natural Australian English. Friendly and laid-back.`;
    } else if (voice === 'arabic') {
        voiceProfile = `# AUDIO PROFILE: Khalid
## "The Professional Narrator"

## THE SCENE: Professional Recording Studio
A professional broadcast-quality studio. Khalid delivers content with cultural authority and smooth articulation.

### DIRECTOR'S NOTES
Style: Authoritative, culturally authentic, and smooth.
Pacing: Measured. Slow down on complex terminology.
Accent: Clear Modern Standard Arabic pronunciation.`;
    }

    // Build speed tag based on slider value
    const speedVal = parseFloat(speed || '1.0');
    let speedTag = '';
    if (speedVal > 1.5) speedTag = '[fast] ';
    else if (speedVal > 1.2) speedTag = '[slightly fast] ';
    else if (speedVal < 0.7) speedTag = '[very slow] ';
    else if (speedVal < 0.9) speedTag = '[slow] ';

    // Split text into chunks to maintain quality
    const chunks = splitTextBySentence(text, 350);
    console.log(`[Gemini TTS] Splitting ${text.split(/\s+/).length} words into ${chunks.length} chunks. Processing in PARALLEL.`);

    // Process chunks in parallel to prevent timeouts
    const chunkPromises = chunks.map(async (chunk, i) => {
        // Pre-process chunk to force pacing in long run-on sentences
        const pacedChunk = forcePacing(chunk);

        const userDirectorNote = prompt ? `\n### USER DIRECTOR INSTRUCTIONS\n${prompt}` : '';

        const finalPrompt = `${voiceProfile}${userDirectorNote}

#### TRANSCRIPT
${speedTag}${pacedChunk}`.trim();

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${apiKey}`,
            {
                contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                // Resonant voices for formal/academic content
                                voiceName: voice === 'british-rp' ? 'Charon' : (voice === 'arabic' ? 'Fenrir' : 'Aoede')
                            }
                        }
                    }
                }
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
    // Gemini TTS returns 24kHz PCM — correct sample rate is critical for proper playback speed
    const wavBuffer = wrapPcmInWav(fullPcm, 24000);

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
