import express from 'express';
import multer from 'multer';
import { validateJWT } from '../middlewares/auth.js';
import type { AuthRequest } from '../middlewares/auth.js';
import { getPoints, deductPoint, refundPoint } from '../services/points.js';
import { checkRateLimit } from '../services/ratelimit.js';
import { fetchExchangeRates } from '../services/pricing.js';
import { generateTTS, transcribeAudio } from '../services/gemini.js';
import type { TTSRequest } from '../types/index.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

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

router.post('/tts', validateJWT, async (req: AuthRequest, res) => {
    const userId = req.user!.id;

    const rateCheck = await checkRateLimit(userId, 'tts');
    if (!rateCheck.allowed) {
        return res.status(429).json({ error: `Rate limit reached. Please wait ${rateCheck.retryAfterSeconds} seconds.` });
    }

    const { text, prompt, voice, speed } = req.body as TTSRequest;
    if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: 'Text is required.' });
    }

    const wordCount = text.trim().split(/\s+/).length;
    const requiredPoints = Math.max(1, Math.ceil(wordCount / 400));

    const deduction = await deductPoint(userId, requiredPoints);
    if (!deduction.success) {
        return res.status(402).json({ error: `Insufficient points. Requires ${requiredPoints} points for ~${wordCount} words. You have ${deduction.remaining} point(s).` });
    }

    try {
        const audioBuffer = await generateTTS(text, voice, speed, prompt);
        
        // Send points in a header and audio in the body to save memory
        res.set('Content-Type', 'audio/wav');
        res.set('x-points-remaining', deduction.remaining.toString());
        
        res.send(audioBuffer);
    } catch (e: any) {
        await refundPoint(userId, requiredPoints);
        res.status(502).json({ error: `Speech synthesis failed: ${e.message}. Points refunded.` });
    }
});

router.post('/stt', validateJWT, upload.single('audio'), async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded.' });

    const duration = parseFloat(req.body.duration || '0');
    // Pricing: 1 point per 2 minutes (120 seconds). Minimum 1 point.
    const requiredPoints = Math.max(1, Math.ceil(duration / 120));

    const rateCheck = await checkRateLimit(userId, 'stt');
    if (!rateCheck.allowed) {
        return res.status(429).json({ error: `Rate limit reached. Please wait ${rateCheck.retryAfterSeconds} seconds.` });
    }

    const deduction = await deductPoint(userId, requiredPoints);
    if (!deduction.success) {
        return res.status(402).json({ error: `Insufficient points. Requires ${requiredPoints} points for ~${Math.ceil(duration/60)} mins. You have ${deduction.remaining} point(s).` });
    }

    try {
        const lang = req.body.lang || 'en';
        const diarize = req.body.diarize === 'true';
        const result = await transcribeAudio(req.file.buffer, req.file.mimetype, lang, diarize);
        result.pointsRemaining = deduction.remaining;
        res.json(result);
    } catch (e: any) {
        await refundPoint(userId, requiredPoints);
        res.status(502).json({ error: `Transcription failed: ${e.message}. Points refunded.` });
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
