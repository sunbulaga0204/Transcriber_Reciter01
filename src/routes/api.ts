import express from 'express';
import multer from 'multer';
import { validateJWT } from '../middlewares/auth.js';
import type { AuthRequest } from '../middlewares/auth.js';
import { getPoints } from '../services/points.js';
import { checkRateLimit } from '../services/ratelimit.js';
import { fetchExchangeRates } from '../services/pricing.js';
import { transcribeAudio } from '../services/gemini.js';
import { processYoutubeLink, getYoutubeInfo } from '../services/youtube.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB limit for up to 120min audio

router.get('/pricing', async (req, res) => {
    try {
        const data = await fetchExchangeRates();
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/points', validateJWT, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.id;
        const email = req.user!.email;
        const isAdmin = req.user!.roles.includes('admin');
        const data = await getPoints(userId, isAdmin, email);
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


router.post('/yt-info', validateJWT, async (req: AuthRequest, res) => {
    try {
        const { linkUrl } = req.body;
        if (!linkUrl) return res.status(400).json({ error: 'Link URL is required.' });
        
        const info = await getYoutubeInfo(linkUrl);
        res.json(info);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/stt', validateJWT, upload.single('audio'), async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const { linkUrl, lang, diarize: diarizeStr } = req.body;
    
    if (!req.file && !linkUrl) {
        return res.status(400).json({ error: 'No audio file or link provided.' });
    }

    let fileBuffer: Buffer;
    let mimeType: string;
    let duration: number;

    try {
        if (linkUrl) {
            // Process YouTube or external link
            const result = await processYoutubeLink(linkUrl);
            fileBuffer = result.buffer;
            mimeType = result.mimeType;
            duration = result.duration;
        } else {
            // Process uploaded file
            fileBuffer = req.file!.buffer;
            mimeType = req.file!.mimetype;
            duration = parseFloat(req.body.duration || '0');
        }
    } catch (e: any) {
        return res.status(400).json({ error: `Audio processing failed: ${e.message}` });
    }

    // Points deduction is temporarily deactivated during payment system revision
    const currentPointsData = await getPoints(userId, false, req.user!.email);
    const userRemainingPoints = currentPointsData.points;

    // Fast-path mock response for rapid UI/feature evaluation without calling external Gemini API
    if (process.env.MOCK_API === 'true' || req.headers['x-mock-mode'] === 'true') {
        const mockRawTranscript = `[00:00 - 00:06] Speaker A: Welcome to our deep dive on modern multimodal speech recognition and audio analysis.
[00:07 - 00:15] Speaker B: Thank you! Today we will examine how real-time recording caches audio directly in client storage.
[00:16 - 00:23] Speaker A: Exactly. Audio is captured in high fidelity and streamed into IndexedDB without straining browser memory.
[00:24 - 00:32] Speaker B: That allows long recordings of up to 120 minutes with zero frame drops or tab freezing.
[00:33 - 00:41] Speaker A: Once recording stops, users can immediately export lossless 16-bit PCM WAV files.
[00:42 - 00:50] Speaker B: Furthermore, full timestamped diarization is preserved for clean subtitle synchronization.
[00:51 - 01:00] Speaker A: Notice that the on-screen preview cleanly caps at 35% of the total content to protect output integrity.
[01:01 - 01:10] Speaker B: While the complete 100% transcript and SRT subtitles remain fully accessible via the export buttons.
[01:11 - 01:20] Speaker A: This provides an optimal experience for researchers, legal transcribers, and video creators alike.
[01:21 - 01:30] Speaker B: In conclusion, the architecture combines memory safety, high precision, and flexible format exports.`;

        const mockSegments = [
            { startSec: 0, endSec: 6, timeRange: '00:00 - 00:06', speaker: 'Speaker A', text: 'Welcome to our deep dive on modern multimodal speech recognition and audio analysis.' },
            { startSec: 7, endSec: 15, timeRange: '00:07 - 00:15', speaker: 'Speaker B', text: 'Thank you! Today we will examine how real-time recording caches audio directly in client storage.' },
            { startSec: 16, endSec: 23, timeRange: '00:16 - 00:23', speaker: 'Speaker A', text: 'Exactly. Audio is captured in high fidelity and streamed into IndexedDB without straining browser memory.' },
            { startSec: 24, endSec: 32, timeRange: '00:24 - 00:32', speaker: 'Speaker B', text: 'That allows long recordings of up to 120 minutes with zero frame drops or tab freezing.' },
            { startSec: 33, endSec: 41, timeRange: '00:33 - 00:41', speaker: 'Speaker A', text: 'Once recording stops, users can immediately export lossless 16-bit PCM WAV files.' },
            { startSec: 42, endSec: 50, timeRange: '00:42 - 00:50', speaker: 'Speaker B', text: 'Furthermore, full timestamped diarization is preserved for clean subtitle synchronization.' },
            { startSec: 51, endSec: 60, timeRange: '00:51 - 01:00', speaker: 'Speaker A', text: 'Notice that the on-screen preview cleanly caps at 35% of the total content to protect output integrity.' },
            { startSec: 61, endSec: 70, timeRange: '01:01 - 01:10', speaker: 'Speaker B', text: 'While the complete 100% transcript and SRT subtitles remain fully accessible via the export buttons.' },
            { startSec: 71, endSec: 80, timeRange: '01:11 - 01:20', speaker: 'Speaker A', text: 'This provides an optimal experience for researchers, legal transcribers, and video creators alike.' },
            { startSec: 81, endSec: 90, timeRange: '01:21 - 01:30', speaker: 'Speaker B', text: 'In conclusion, the architecture combines memory safety, high precision, and flexible format exports.' }
        ];

        const mockFormatted = mockRawTranscript.split('\n').map(line => {
            let processed = line
                .replace(/\[(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})\]/g, '<span class="timestamp">[$1]</span>')
                .replace(/^(Speaker [A-Z]|[\w\s]+):/i, '<strong>$1:</strong>');
            return `<p>${processed}</p>`;
        }).join('');

        return res.json({
            transcript: mockFormatted,
            rawTranscript: mockRawTranscript,
            summary: 'This session demonstrates the refactored Aurelius Transcriber engine. It showcases client-side IndexedDB caching for long-duration audio capture (up to 120 minutes), 16-bit PCM WAV export, 35% on-screen display preview cutoff, and complete 100% text and SRT subtitle generation.',
            pointsRemaining: userRemainingPoints,
            segments: mockSegments
        });
    }

    try {
        const transcribeLang = lang || 'en';
        const diarize = diarizeStr === 'true';
        const result = await transcribeAudio(fileBuffer, mimeType, transcribeLang, diarize);
        result.pointsRemaining = userRemainingPoints;
        res.json(result);
    } catch (e: any) {
        res.status(502).json({ error: `Transcription failed: ${e.message}` });
    }
});

// --- Admin Routes ---
const isAdmin = (req: AuthRequest, res: any, next: any) => {
    if (req.user && req.user.roles.includes('admin')) {
        return next();
    }
    res.status(403).json({ error: 'Admin access required' });
};

router.get('/admin/users', validateJWT, isAdmin, async (req, res) => {
    try {
        const { dbStore } = await import('../db/store.js');
        const users = dbStore.getAllPoints();
        res.json(users);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/admin/update-points', validateJWT, isAdmin, async (req, res) => {
    try {
        const { userId, points, tier } = req.body;
        const { dbStore } = await import('../db/store.js');
        dbStore.setPoints(userId, { points, tier });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
