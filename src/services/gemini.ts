import axios from 'axios';
import type { STTResponse } from '../types/index.js';

export async function transcribeAudio(fileBuffer: Buffer, mimeType: string, lang: string = 'en', diarize: boolean = true): Promise<STTResponse> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');

    const base64Data = fileBuffer.toString('base64');
    
    let diarizationInstruction = '';
    if (diarize) {
        diarizationInstruction = '2. Use Speaker Diarization: Distinguish speakers and label them.\n3. Format every spoken turn with precise time ranges like [00:00 - 00:05] Speaker Name: [Text].';
    } else {
        diarizationInstruction = '2. Format with precise time ranges like [00:00 - 00:05] at the start of meaningful segments.';
    }

    const prompt = `Please act as a professional transcriber. 
1. Transcribe the provided audio file exactly as spoken. 
${diarizationInstruction}
4. After the transcription, provide a line break with "---SUMMARY---" and then write a concise 1-paragraph summary of the audio.
Ensure the transcription is highly accurate. Language: ${lang}`;

    // Target model: prioritize gemini-2.5-flash which reliably supports multimodal audio STT
    const modelName = process.env.GEMINI_STT_MODEL || 'gemini-2.5-flash';

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
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
            timeout: 300000, // 5 minutes timeout for longer audio
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        }
    );

    const candidates = response.data.candidates;
    if (!candidates || candidates.length === 0) throw new Error("No candidates returned from Gemini");
    
    const fullText = candidates[0].content.parts.map((p: any) => p.text).join(' ');
    
    const splitTag = '---SUMMARY---';
    let rawTranscript = fullText;
    let summary = 'Summary generation skipped or format failed.';
    
    if (fullText.includes(splitTag)) {
        const parts = fullText.split(splitTag);
        rawTranscript = parts[0].trim();
        summary = parts[1].trim();
    }

    const segments: Array<{ startSec: number; endSec: number; timeRange: string; speaker: string; text: string }> = [];

    const formattedTranscript = rawTranscript.split('\n')
        .filter((line: string) => line.trim().length > 0)
        .map((line: string) => {
            // Check for timestamp pattern [mm:ss - mm:ss] or [hh:mm:ss - hh:mm:ss]
            const timeMatch = line.match(/\[(\d{1,2}:\d{2}(?::\d{2})?\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)\]/);
            const speakerMatch = line.replace(/\[.*?\]\s*/, '').match(/^([^:]+):/);

            const timeRange = timeMatch ? timeMatch[1].trim() : '';
            const speaker = speakerMatch ? speakerMatch[1].trim() : '';
            const spokenText = line.replace(/\[.*?\]\s*/, '').replace(/^[^:]+:\s*/, '').trim();

            if (timeRange) {
                const [startStr, endStr] = timeRange.split('-').map(s => s.trim());
                const parseToSec = (str: string) => {
                    const p = str.split(':').map(Number);
                    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
                    if (p.length === 2) return p[0] * 60 + p[1];
                    return 0;
                };
                segments.push({
                    startSec: parseToSec(startStr),
                    endSec: parseToSec(endStr),
                    timeRange,
                    speaker: speaker || 'Speaker',
                    text: spokenText
                });
            }

            // Bold Speaker labels and colorize timestamps
            let processed = line
                .replace(/\[(\d{1,2}:\d{2}(?::\d{2})?\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)\]/g, '<span class="timestamp">[$1]</span>')
                .replace(/^(Speaker [A-Z0-9]+|[\w\s]+):/i, '<strong>$1:</strong>');
            return `<p>${processed}</p>`;
        })
        .join('');

    return {
        transcript: formattedTranscript,
        rawTranscript,
        summary,
        pointsRemaining: 0,
        segments
    };
}
