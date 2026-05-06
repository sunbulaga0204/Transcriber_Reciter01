import axios from 'axios';
import type { STTResponse } from '../types/index.js';

export async function generateTTS(text: string, voice?: string, speed?: string, prompt?: string): Promise<Buffer> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');

    let personaInstructions = '';
    if (voice === 'british-rp') {
        personaInstructions = 'Use a sophisticated British Received Pronunciation (RP) accent. The tone should be formal, clear, and elegant.';
    } else if (voice === 'australian') {
        personaInstructions = 'Use a natural Australian accent. The tone should be friendly, clear, and laid-back.';
    } else if (voice === 'arabic') {
        personaInstructions = 'Use a clear and professional Arabic accent. The tone should be culturally authentic, authoritative, and smooth.';
    }

    const speedInstruction = speed ? `Please read at ${speed}x speed.` : '';

    const finalPrompt = `
Instruction: Please act as a professional voice actor.
Persona: ${personaInstructions}
Specific Director Instructions: ${prompt || 'None'}
Reading Speed: ${speedInstruction || 'Normal'}

Text to read:
${text}
`.trim();

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
        {
            contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
            generationConfig: { responseModalities: ["AUDIO"] }
        },
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: 180000 // 3 minutes
        }
    );

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) throw new Error("No candidates returned from Gemini");
    
    const parts = candidates[0].content.parts;
    const audioPart = parts.find((p: any) => p.inlineData && p.inlineData.mimeType.startsWith('audio/'));
    
    if (!audioPart) throw new Error("Gemini did not return audio inlineData.");

    const base64Audio = audioPart.inlineData.data;
    const rawBuffer = Buffer.from(base64Audio, 'base64');
    
    // Gemini returns raw 16-bit PCM. High-quality models typically use 48kHz.
    const wavBuffer = wrapPcmInWav(rawBuffer, 48000);

    console.log(`[Gemini TTS] Wrapped raw PCM in WAV header. Final Size: ${wavBuffer.length} bytes`);

    return wavBuffer;
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
        diarizationInstruction = '2. Use Speaker Diarization: Distinguish between different speakers and label them (e.g., Speaker A, Speaker B, or use names if identified).\n3. Format it with timestamps like [00:00] Speaker Name: [Text].';
    } else {
        diarizationInstruction = '2. Format the transcription with timestamps like [00:00] at the start of meaningful segments.';
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
                .replace(/\[(\d{2}:\d{2})\]/g, '<span class="timestamp">[$1]</span>')
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
