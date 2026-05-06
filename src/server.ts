import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();


import apiRoutes from './routes/api.js';

const app = express();
const PORT = process.env.PORT || 8888;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API Routes
app.use('/api', apiRoutes);

// Dynamic Config for Frontend
app.get('/config.js', (req, res) => {
    res.type('application/javascript');
    res.send(`window.AURELIUS_CONFIG = { netlifyUrl: "${process.env.NETLIFY_SITE_URL || ''}" };`);
});

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
