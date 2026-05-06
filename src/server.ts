import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Forcefully load and apply .env variables before anything else
if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        process.env[key] = value;
    }
} else {
    dotenv.config(); // fallback
}

import apiRoutes from './routes/api.js';

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API Routes
app.use('/api', apiRoutes);

// Static Files (Serve the frontend HTML/JS/CSS)
app.use(express.static(process.cwd()));

// Fallback to index.html for SPA routing if needed
app.use((req, res) => {
    res.sendFile(path.join(process.cwd(), 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 Aurelius Server (Agnostic Mode) is running on port ${PORT}`);
    console.log(`- Google API Key: ${process.env.GOOGLE_API_KEY ? '✅ Loaded' : '❌ MISSING'}`);
    console.log(`- ExchangeRate Key: ${process.env.EXCHANGERATE_API_KEY ? '✅ Loaded' : '❌ MISSING'}`);
    console.log(`\nTo test, open http://localhost:${PORT} in your browser.`);
});
